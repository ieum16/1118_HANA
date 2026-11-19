const REMINDER_MINUTES = [60, 30, 10];
const ALARM_NAME = 'deadline-check';
let queue = Promise.resolve();

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function checkReminders() {
  const now = Date.now();
  const stored = await chrome.storage.local.get(['tasks', 'reminderState']);
  const state = stored.reminderState || { checkedAt: now - 60000, sent: {} };
  const since = Math.min(state.checkedAt, now);
  // Also inspect tomorrow so reminders for just after midnight arrive today.
  const dates = [new Date(now), new Date(now)];
  dates[1].setDate(dates[1].getDate() + 1);
  for (const task of stored.tasks || []) {
    if (!task.deadline) continue;
    const days = task.type === 'daily' ? dates.map(dateKey) : [task.date];
    for (const day of days) {
      if (task.date > day || task.completedDates.includes(day)) continue;
      const deadline = new Date(`${day}T${task.deadline}:00`).getTime();
      if (!Number.isFinite(deadline) || deadline <= now) continue;
      const pending = REMINDER_MINUTES.filter((minutes) => {
        const at = deadline - minutes * 60000;
        const key = `${task.id}|${day}|${minutes}`;
        return at > since && at <= now && at >= (task.createdAt || 0) && !state.sent[key];
      });
      // After a long browser suspension, show the closest pending reminder once.
      if (pending.length) {
        const minutes = Math.min(...pending);
        const remaining = Math.max(1, Math.ceil((deadline - now) / 60000));
        await chrome.notifications.create(`task-${task.id}-${day}-${minutes}`, {
          type: 'basic', iconUrl: 'icon.png',
          title: `할 일 알림 · 마감 ${remaining}분 전`,
          message: `${task.title}\n${task.category} · ${day} ${task.deadline} 마감`,
          priority: 1
        });
        for (const minute of pending) state.sent[`${task.id}|${day}|${minute}`] = now;
      }
    }
  }
  const activeIds = new Set((stored.tasks || []).map((task) => task.id));
  state.sent = Object.fromEntries(Object.entries(state.sent).filter(([key, sentAt]) => activeIds.has(key.split('|')[0]) && sentAt > now - 172800000));
  state.checkedAt = now;
  await chrome.storage.local.set({ reminderState: state });
}

function requestCheck() {
  queue = queue.then(checkReminders).catch((error) => console.error('마감 알림 확인 실패', error));
  return queue;
}

async function ensureAlarm() {
  if (!await chrome.alarms.get(ALARM_NAME)) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
  await requestCheck();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) return requestCheck();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tasks) requestCheck();
});
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ installedVersion: chrome.runtime.getManifest().version });
  await ensureAlarm();
});
ensureAlarm().catch(console.error);
