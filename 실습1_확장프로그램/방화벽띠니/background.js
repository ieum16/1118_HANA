importScripts('core.js');
const C = TodoCore, PREFIX = 'today-cat:';
let queue = Promise.resolve();
async function syncAlarms() {
  const data = await chrome.storage.local.get(C.KEY);
  const state = data[C.KEY];
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter(a => a.name.startsWith(PREFIX)).map(a => chrome.alarms.clear(a.name)));
  if (!state?.reminders) return;
  for (const [date, day] of Object.entries(state.days)) {
    for (const task of C.schedule(day, date)) {
      if (task.start > Date.now()) await chrome.alarms.create(`${PREFIX}${date}:${task.id}`, { when: task.start });
    }
  }
}
function sync() { queue = queue.catch(() => {}).then(syncAlarms); queue.catch(console.error); return queue; }
chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[C.KEY]) sync(); });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(PREFIX)) return;
  const [date, id] = alarm.name.slice(PREFIX.length).split(':');
  const data = await chrome.storage.local.get(C.KEY), state = data[C.KEY];
  if (!state?.reminders || !state.days[date]) return;
  const task = C.schedule(state.days[date], date).find(t => t.id === id);
  // Ignore obsolete or stale alarms after rescheduling, sleeping, or closing Chrome.
  if (!task || Math.abs(task.start - alarm.scheduledTime) > 1000 || Date.now() >= task.end) return;
  await chrome.notifications.create(alarm.name, { type: 'basic', iconUrl: 'icons/icon128.png', title: '오늘 할일 · 시작할 시간이에요', message: `${task.text} · ${task.minutes}분`, priority: 1 });
});
chrome.notifications.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('todo.html?full=1') }));
