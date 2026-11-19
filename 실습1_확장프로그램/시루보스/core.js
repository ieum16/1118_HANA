export function dateKey(value) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function shiftDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}
export function titleKey(title) {
  return title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko");
}
export function selectTodos(todos, start, selectedDay = null) {
  const from = startOfDay(start).getTime();
  const until = shiftDays(startOfDay(start), 7).getTime();
  return todos.filter(todo => {
    const deadline = new Date(todo.deadline).getTime();
    return deadline >= from && deadline < until && (!selectedDay || dateKey(todo.deadline) === selectedDay);
  }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline) || a.createdAt - b.createdAt);
}
export function validateTodo(title, deadline, todos) {
  if (!titleKey(title)) return "할 일을 입력해 주세요.";
  if (title.trim().length > 100) return "할 일은 100자 이내로 입력해 주세요.";
  if (!deadline || !Number.isFinite(new Date(deadline).getTime())) return "올바른 마감 날짜와 시간을 입력해 주세요.";
  if (todos.some(todo => titleKey(todo.title) === titleKey(title))) return "이미 등록한 할 일이에요. 완료한 항목도 확인해 주세요.";
  return "";
}
