/* Shared by the popup and service worker. All times are local calendar times. */
globalThis.TodoCore = (() => {
  const KEY = 'today-cat-v1';
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function roundTime(now = new Date()) {
    // Keep the anchor in today's calendar; the actual tasks may cross midnight.
    const minutes = Math.min(1439, Math.ceil((now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 5) * 5);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  function emptyDay(now = new Date()) { return { start: roundTime(now), tasks: [], addedCount: 0 }; }
  function addTask(day, task) {
    day.addedCount = (Number.isSafeInteger(day.addedCount) ? day.addedCount : day.tasks.length) + 1;
    day.tasks.push(task);
    return day.addedCount;
  }
  function shouldShowHuh(day) {
    const remaining = day.tasks.filter(task => !task.done).length;
    return remaining > 0 && remaining % 5 === 0;
  }
  function schedule(day, date) {
    const [year, month, dom] = date.split('-').map(Number);
    const [hour, minute] = day.start.split(':').map(Number);
    let cursor = new Date(year, month - 1, dom, hour, minute).getTime();
    return day.tasks.filter(t => !t.done).map(task => {
      const start = cursor;
      cursor += task.minutes * 60000;
      return { ...task, start, end: cursor };
    });
  }
  return { KEY, dayKey, roundTime, emptyDay, addTask, shouldShowHuh, schedule };
})();
