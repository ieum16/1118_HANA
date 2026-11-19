import { dayKey, parseTime, eventBody, dueSlots, recentTasks } from './core.js';
import { dailyState, checkDaily, dailyRequest, dailyWindowRemoved } from './daily.js';

const DEFAULTS = { tasks: [], reminderTimes: ['09:00', '18:00'], sent: [], calendars: [], personalId: '', teamId: '' };
const SCOPES = chrome.runtime.getManifest().oauth2.scopes;
let queue = Promise.resolve();
let opening;

function serial(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

async function state() {
  const data = await chrome.storage.local.get(DEFAULTS);
  const tasks = recentTasks(data.tasks);
  if (JSON.stringify(tasks) !== JSON.stringify(data.tasks)) {
    await chrome.storage.local.set({ tasks });
    data.tasks = tasks;
  }
  return { ...data, ...await dailyState() };
}

async function openTodo() {
  if (opening) return opening;
  opening = (async () => {
    const saved = await chrome.storage.session.get('todoWindowId');
    if (saved.todoWindowId !== undefined) {
      try {
        return await chrome.windows.update(saved.todoWindowId, { focused: true, state: 'normal' });
      } catch { /* 닫힌 창이면 새로 연다. */ }
    }
    const win = await chrome.windows.create({ url: chrome.runtime.getURL('todo.html'), type: 'popup', width: 550, height: 840, focused: true });
    await chrome.storage.session.set({ todoWindowId: win.id });
    return win;
  })();
  try { return await opening; } finally { opening = null; }
}

async function checkReminders() {
  const data = await state();
  const due = dueSlots(data.reminderTimes, data.sent);
  const outstanding = data.tasks.some(task => !task.date && !task.done);
  if (due.length && outstanding) await openTodo();
  if (due.length) {
    const today = dayKey();
    await chrome.storage.local.set({ sent: [...data.sent.filter(key => key.startsWith(today + '/')), ...due] });
  }
  await checkDaily();
}

async function initialize() {
  await chrome.alarms.create('soy-reminders', { periodInMinutes: 1 });
  await checkReminders();
}

function configured() {
  return !chrome.runtime.getManifest().oauth2.client_id.startsWith('000000000000-');
}

async function token(interactive) {
  if (!configured()) throw new Error('먼저 설정의 Google Calendar 연결 안내에 따라 OAuth 클라이언트 ID를 등록해 주세요.');
  const result = await chrome.identity.getAuthToken({ interactive, scopes: SCOPES });
  if (!result.token) throw new Error('Google 연결이 완료되지 않았어요. 설정에서 다시 연결해 주세요.');
  return result.token;
}

async function api(path, { method = 'GET', body, interactive = false } = {}) {
  let accessToken = await token(interactive);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/' + path, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000)
    });
    if (response.status === 401 && attempt === 0) {
      await chrome.identity.removeCachedAuthToken({ token: accessToken });
      accessToken = await token(false);
      continue;
    }
    const json = await response.json();
    if (!response.ok) {
      const error = new Error(json.error?.message || `Google Calendar 오류 (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return json;
  }
}

async function loadCalendars() {
  await token(true);
  const calendars = [];
  let pageToken = '';
  do {
    const page = await api('users/me/calendarList?minAccessRole=writer&showHidden=true&maxResults=250&pageToken=' + encodeURIComponent(pageToken));
    calendars.push(...page.items);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  const data = await state();
  const personalId = calendars.some(c => c.id === data.personalId) ? data.personalId : (calendars.find(c => c.primary)?.id || '');
  const teamId = calendars.some(c => c.id === data.teamId) ? data.teamId : '';
  await chrome.storage.local.set({ calendars, personalId, teamId });
  return { calendars, personalId, teamId };
}

async function syncTask(task, data) {
  const path = `calendars/${encodeURIComponent(task.calendarId)}/events`;
  try {
    let event;
    try {
      event = await api(path, { method: 'POST', body: eventBody(task) });
    } catch (error) {
      if (error.status !== 409) throw error;
      // 동일 ID로 재시도해 네트워크 중단 뒤에도 중복 일정을 만들지 않는다.
      event = await api(`${path}/${task.eventId}`);
    }
    task.sync = 'saved';
    task.eventUrl = event.htmlLink;
    task.error = '';
  } catch (error) {
    task.sync = 'error';
    task.error = error.message;
  }
  await chrome.storage.local.set({ tasks: data.tasks });
  return task;
}

async function handle(message) {
  if (message.type?.startsWith('daily')) return dailyRequest(message);
  const data = await state();
  switch (message.type) {
    case 'state': return { ...data, configured: configured(), extensionId: chrome.runtime.id };
    case 'connect': return loadCalendars();
    case 'settings': {
      const times = message.reminderTimes;
      if (!Array.isArray(times) || times.length !== 2 || times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || times[0] === times[1]) throw new Error('서로 다른 알림 시간 두 개를 선택해 주세요.');
      for (const id of [message.personalId, message.teamId].filter(Boolean)) {
        if (!data.calendars.some(c => c.id === id)) throw new Error('캘린더를 다시 연결해 주세요.');
      }
      if (message.personalId && message.personalId === message.teamId) throw new Error('개인과 팀 캘린더는 각각 다른 캘린더를 선택해 주세요.');
      await chrome.storage.local.set({ reminderTimes: [...times].sort(), personalId: message.personalId, teamId: message.teamId });
      return true;
    }
    case 'add': {
      const text = String(message.text || '').trim();
      if (!text || text.length > 200) throw new Error('할 일을 200자 이내로 적어 주세요.');
      const date = message.date || '';
      const time = parseTime(message.time || '');
      if (time && !date) throw new Error('시간을 입력할 때는 날짜도 선택해 주세요.');
      const task = { id: crypto.randomUUID(), text, date, time, urgent: message.urgent === true, createdDay: dayKey(), done: false };
      if (date) {
        if (!['personal', 'team'].includes(message.target)) throw new Error('캘린더를 선택해 주세요.');
        task.calendarId = message.target === 'team' ? data.teamId : data.personalId;
        const calendar = data.calendars.find(c => c.id === task.calendarId);
        if (!calendar) throw new Error('설정에서 Google을 연결하고 개인·팀 캘린더를 지정해 주세요.');
        task.calendarName = message.target === 'team' ? '팀 캘린더' : '내 캘린더';
        task.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        task.eventId = task.id.replaceAll('-', '');
        task.sync = 'pending';
        eventBody(task);
      }
      data.tasks.push(task);
      await chrome.storage.local.set({ tasks: data.tasks });
      if (date) return syncTask(task, data);
      return task;
    }
    case 'setUrgent': {
      const task = data.tasks.find(t => t.id === message.id && !t.date);
      if (!task) throw new Error('할 일을 찾을 수 없어요.');
      if (typeof message.urgent !== 'boolean') throw new Error('긴급 여부를 확인해 주세요.');
      task.urgent = message.urgent;
      await chrome.storage.local.set({ tasks: data.tasks });
      return task;
    }
    case 'toggle': {
      const task = data.tasks.find(t => t.id === message.id && !t.date);
      if (!task) throw new Error('할 일을 찾을 수 없어요.');
      task.done = !task.done;
      task.completedDay = task.done ? dayKey() : '';
      task.completedAt = task.done ? Date.now() : null;
      await chrome.storage.local.set({ tasks: data.tasks });
      return task;
    }
    case 'delete': {
      if (data.tasks.some(t => t.id === message.id && t.date)) throw new Error('등록한 일정은 Google Calendar에서 수정해 주세요.');
      await chrome.storage.local.set({ tasks: data.tasks.filter(t => t.id !== message.id) });
      return true;
    }
    case 'retry': {
      const task = data.tasks.find(t => t.id === message.id && t.date && t.sync !== 'saved');
      if (!task) throw new Error('다시 보낼 일정을 찾을 수 없어요.');
      return syncTask(task, data);
    }
    case 'open': await openTodo(); return true;
    default: throw new Error('알 수 없는 요청이에요.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target === 'soy-audio') return false;
  serial(() => handle(message)).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => { openTodo().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { serial(initialize).then(openTodo).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { serial(initialize).catch(console.error); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'soy-reminders') serial(checkReminders).catch(console.error);
  if (alarm.name === 'soy-daily-next') serial(checkDaily).catch(console.error);
});
chrome.windows.onRemoved.addListener(id => { serial(() => dailyWindowRemoved(id)).catch(console.error); });
// 업데이트·비정상 종료 뒤에도 저장한 알림과 미확인 상태를 복구한다.
serial(async () => {
  if (!await chrome.alarms.get('soy-reminders')) await chrome.alarms.create('soy-reminders', { periodInMinutes: 1 });
  await checkDaily();
}).catch(console.error);
