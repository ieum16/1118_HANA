import { dayKey, parseTime } from './core.js';

const ALARM = 'soy-daily-next';
let opening;

export async function dailyState() {
  const data = await chrome.storage.local.get({ dailyTasks: null, dailyOccurrences: [], dailySoundError: '' });
  if (data.dailyTasks === null) {
    data.dailyTasks = [{ id: crypto.randomUUID(), text: '오늘 일정 확인', time: '09:15', enabled: true, firstDay: dayKey() }];
    await chrome.storage.local.set({ dailyTasks: data.dailyTasks });
  }
  return data;
}

export function collectDue(tasks, occurrences, now = new Date()) {
  const today = dayKey(now);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const existing = new Set(occurrences.map(item => item.id));
  return tasks.filter(task => task.enabled && task.firstDay <= today && task.time <= clock && !existing.has(`${task.id}/${today}`))
    .map(task => ({ id: `${task.id}/${today}`, taskId: task.id, text: task.text, time: task.time, day: today, acknowledged: false }));
}

async function schedule(tasks) {
  const now = new Date();
  const times = tasks.filter(task => task.enabled).map(task => {
    const next = new Date(`${dayKey(now)}T${task.time}:00`);
    if (next <= now) next.setDate(next.getDate() + 1);
    if (dayKey(next) < task.firstDay) return new Date(`${task.firstDay}T${task.time}:00`).getTime();
    return next.getTime();
  });
  if (times.length) await chrome.alarms.create(ALARM, { when: Math.min(...times) });
  else await chrome.alarms.clear(ALARM);
}

async function openAlert(focus) {
  if (opening) return opening;
  opening = (async () => {
    const { dailyWindowId } = await chrome.storage.session.get('dailyWindowId');
    if (dailyWindowId !== undefined) {
      try {
        const win = await chrome.windows.get(dailyWindowId);
        if (focus) return await chrome.windows.update(win.id, { focused: true, state: 'normal' });
        return win;
      } catch { /* 닫힌 알림은 새 창으로 다시 표시한다. */ }
    }
    const win = await chrome.windows.create({ url: chrome.runtime.getURL('daily-alert.html'), type: 'popup', width: 490, height: 600, focused: true });
    await chrome.storage.session.set({ dailyWindowId: win.id });
    return win;
  })();
  try { return await opening; } finally { opening = null; }
}

async function audioContextExists() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('audio.html')] });
  return contexts.length > 0;
}

async function sound(playing) {
  if (!playing) {
    if (await audioContextExists()) await chrome.offscreen.closeDocument();
    return;
  }
  try {
    if (!await audioContextExists()) {
      await chrome.offscreen.createDocument({ url: 'audio.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Daily Task를 확인할 때까지 알림음을 반복 재생합니다.' });
    }
    const result = await chrome.runtime.sendMessage({ target: 'soy-audio', playing: true });
    await chrome.storage.local.set({ dailySoundError: result?.error || '' });
  } catch (error) {
    await chrome.storage.local.set({ dailySoundError: '알림음 재생 실패 · ' + error.message });
  }
}

async function present(data, focus = false) {
  const pending = data.dailyOccurrences.filter(item => !item.acknowledged && !item.dismissed);
  if (pending.length) {
    await openAlert(focus);
    await sound(true);
  } else {
    await sound(false);
  }
}

export async function checkDaily() {
  const data = await dailyState();
  const due = collectDue(data.dailyTasks, data.dailyOccurrences);
  if (due.length) {
    // 먼저 발생 기록을 저장해 서비스 워커가 중단되어도 알림을 잃지 않는다.
    data.dailyOccurrences.push(...due);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    data.dailyOccurrences = data.dailyOccurrences.filter(item => (!item.acknowledged && !item.dismissed) || item.day >= dayKey(cutoff));
    await chrome.storage.local.set({ dailyOccurrences: data.dailyOccurrences });
  }
  await schedule(data.dailyTasks);
  await present(data, due.length > 0);
}

export async function dailyWindowRemoved(windowId) {
  const { dailyWindowId } = await chrome.storage.session.get('dailyWindowId');
  if (windowId !== dailyWindowId) return;
  await chrome.storage.session.remove('dailyWindowId');
  const data = await dailyState();
  for (const item of data.dailyOccurrences) {
    if (!item.acknowledged && !item.dismissed) item.dismissed = true;
  }
  await chrome.storage.local.set({ dailyOccurrences: data.dailyOccurrences });
  await sound(false);
}

export async function dailyRequest(message) {
  const data = await dailyState();
  switch (message.type) {
    case 'dailyAdd': {
      const text = String(message.text || '').trim();
      const time = parseTime(String(message.time || ''));
      if (!text || text.length > 200 || !time) throw new Error('반복할 일과 알림 시간을 입력해 주세요.');
      const now = new Date();
      const first = new Date(`${dayKey(now)}T${time}:00`);
      // 이미 지난 시간으로 추가한 항목은 다음 날부터 알린다.
      if (first <= now) first.setDate(first.getDate() + 1);
      data.dailyTasks.push({ id: crypto.randomUUID(), text, time, enabled: true, firstDay: dayKey(first) });
      await chrome.storage.local.set({ dailyTasks: data.dailyTasks });
      await schedule(data.dailyTasks);
      return true;
    }
    case 'dailyToggle':
    case 'dailyDelete': {
      const task = data.dailyTasks.find(item => item.id === message.id);
      if (!task) throw new Error('Daily Task를 찾을 수 없어요.');
      if (message.type === 'dailyDelete') data.dailyTasks = data.dailyTasks.filter(item => item.id !== task.id);
      else task.enabled = !task.enabled;
      // 일시정지하거나 삭제한 반복 항목의 현재 알림도 종료한다.
      if (message.type === 'dailyDelete' || !task.enabled) {
        for (const occurrence of data.dailyOccurrences.filter(item => item.taskId === task.id && !item.acknowledged)) occurrence.dismissed = true;
      }
      await chrome.storage.local.set({ dailyTasks: data.dailyTasks, dailyOccurrences: data.dailyOccurrences });
      await checkDaily();
      return true;
    }
    case 'dailyComplete': {
      const task = data.dailyTasks.find(task => task.id === message.id);
      if (!task) throw new Error('Daily Task를 찾을 수 없어요.');
      const today = dayKey();
      const id = `${task.id}/${today}`;
      let item = data.dailyOccurrences.find(item => item.id === id);
      if (!item) {
        item = { id, taskId: task.id, text: task.text, time: task.time, day: today };
        data.dailyOccurrences.push(item);
      }
      item.acknowledged = true;
      await chrome.storage.local.set({ dailyOccurrences: data.dailyOccurrences });
      await present(data);
      return true;
    }
    case 'dailyAcknowledge': {
      const item = data.dailyOccurrences.find(item => item.id === message.id);
      if (!item) throw new Error('알림을 찾을 수 없어요.');
      item.acknowledged = true;
      await chrome.storage.local.set({ dailyOccurrences: data.dailyOccurrences });
      await present(data);
      return true;
    }
    case 'dailyTest': {
      const id = 'sound-test';
      if (!data.dailyOccurrences.some(item => item.id === id && !item.acknowledged && !item.dismissed)) {
        data.dailyOccurrences = data.dailyOccurrences.filter(item => item.id !== id);
        data.dailyOccurrences.push({ id, taskId: id, text: 'Daily Task 알림 테스트', day: dayKey(), time: '테스트', acknowledged: false });
        await chrome.storage.local.set({ dailyOccurrences: data.dailyOccurrences });
      }
      await present(data, true);
      return true;
    }
    case 'dailySoundRetry': await sound(data.dailyOccurrences.some(item => !item.acknowledged && !item.dismissed)); return true;
    default: throw new Error('알 수 없는 Daily Task 요청이에요.');
  }
}
