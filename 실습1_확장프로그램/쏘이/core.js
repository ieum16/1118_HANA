export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseTime(value) {
  const text = value.trim().replace(/\s/g, '');
  if (!text) return null;
  const match = text.match(/^(오전|오후)?(\d{1,2})(?::(\d{2})|시(?:(\d{1,2})분?)?)?$/);
  if (!match) throw new Error('시간은 8시, 오후 8시, 08:30처럼 입력해 주세요.');
  let hours = Number(match[2]);
  const minutes = Number(match[3] || match[4] || 0);
  if (minutes > 59 || hours > 23 || (match[1] && (hours < 1 || hours > 12))) {
    throw new Error('올바른 시간을 입력해 주세요.');
  }
  if (match[1]) hours = hours % 12 + (match[1] === '오후' ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function eventBody(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date)) throw new Error('날짜를 확인해 주세요.');
  const start = new Date(`${task.date}T${task.time || '00:00'}:00`);
  if (Number.isNaN(start.getTime()) || dayKey(start) !== task.date) throw new Error('날짜 또는 시간을 확인해 주세요.');
  const body = { id: task.eventId, summary: task.text };
  if (task.time) {
    body.start = { dateTime: start.toISOString(), timeZone: task.timeZone };
    body.end = { dateTime: new Date(start.getTime() + 3600000).toISOString(), timeZone: task.timeZone };
  } else {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    body.start = { date: task.date };
    body.end = { date: dayKey(end) };
  }
  return body;
}

export function dueSlots(times, sent, now = new Date()) {
  const day = dayKey(now);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return times.filter(time => time <= clock && !sent.includes(`${day}/${time}`)).map(time => `${day}/${time}`);
}

export function recentTasks(tasks, now = Date.now()) {
  const week = 7 * 24 * 60 * 60 * 1000;
  return tasks.map(task => {
    if (task.date || !task.done || (Number.isFinite(task.completedAt) && task.completedAt > 0)) return task;
    // 이전 버전의 완료 항목은 저장되어 있던 완료 날짜를 기준으로 보존한다.
    const recordedDay = task.completedDay || task.createdDay;
    const recordedTime = recordedDay ? new Date(`${recordedDay}T00:00:00`).getTime() : NaN;
    return { ...task, completedAt: Number.isFinite(recordedTime) ? recordedTime : now };
  }).filter(task => task.date || !task.done || now - task.completedAt < week);
}
