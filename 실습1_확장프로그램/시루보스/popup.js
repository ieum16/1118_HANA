import { dateKey, startOfDay, shiftDays, selectTodos, validateTodo } from "./core.js";

const $ = selector => document.querySelector(selector);
const form = $("#todo-form");
const titleInput = $("#title");
const deadlineInput = $("#deadline");
const list = $("#todos");
let todos = [];
let weekStart = startOfDay();
let selectedDay = null;
let busy = false;
let ready = false;
const STORAGE_KEY = "dontForgetTodos";
const shortDate = date => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
const fullDate = date => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);

function message(text = "", error = false) {
  $("#message").textContent = text;
  $("#message").classList.toggle("error", error);
}

function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll("form input, form button, .todo input, .delete")) {
    control.disabled = busy || !ready;
  }
}

function render() {
  const today = dateKey(new Date());
  const end = shiftDays(weekStart, 6);
  $("#range").textContent = weekStart.getFullYear() + ". " + shortDate(weekStart) + " – " + shortDate(end);
  $("#days").replaceChildren();
  for (let offset = 0; offset < 7; offset++) {
    const date = shiftDays(weekStart, offset);
    const key = dateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day" + (key === today ? " is-today" : "");
    button.setAttribute("aria-pressed", String(selectedDay === key));
    button.setAttribute("aria-label", shortDate(date) + (key === today ? ", 오늘" : "") + " 할 일");
    if (key === today) button.setAttribute("aria-current", "date");
    const weekday = document.createElement("small");
    weekday.textContent = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date);
    const number = document.createElement("strong");
    number.textContent = String(date.getDate());
    button.append(weekday, number);
    button.addEventListener("click", () => {
      selectedDay = selectedDay === key ? null : key;
      render();
    });
    $("#days").append(button);
  }
  $("#all-days").setAttribute("aria-pressed", String(selectedDay === null));
  const visible = selectTodos(todos, weekStart, selectedDay);
  const done = visible.filter(todo => todo.done).length;
  $("#count").textContent = "전체 " + visible.length + " · 완료 " + done;
  $("#empty").hidden = visible.length > 0 || !ready;
  list.replaceChildren();
  for (const todo of visible) {
    const row = document.createElement("li");
    row.className = "todo" + (todo.done ? " done" : "");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", todo.title + " 완료");
    checkbox.addEventListener("change", async () => {
      await commit(todos.map(item => item.id === todo.id ? { ...item, done: checkbox.checked } : item));
    });
    const copy = document.createElement("span");
    copy.className = "todo-copy";
    const title = document.createElement("span");
    title.className = "todo-title";
    title.textContent = todo.title;
    const time = document.createElement("time");
    time.dateTime = todo.deadline;
    const late = !todo.done && new Date(todo.deadline).getTime() < Date.now();
    time.textContent = (late ? "기한 지남 · " : "") + fullDate(new Date(todo.deadline));
    copy.append(title, time);
    label.append(checkbox, copy);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", todo.title + " 삭제");
    remove.addEventListener("click", () => commit(todos.filter(item => item.id !== todo.id)));
    row.append(label, remove);
    list.append(row);
  }
  setBusy(busy);
}

async function commit(next) {
  if (busy || !ready) return false;
  setBusy(true);
  let success = false;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    todos = next;
    success = true;
    message();
  } catch {
    message("저장하지 못했어요. 다시 시도해 주세요.", true);
  } finally {
    setBusy(false);
    render();
  }
  return success;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !ready) return;
  const title = titleInput.value.trim().replace(/\s+/gu, " ");
  const deadline = deadlineInput.value;
  const error = validateTodo(title, deadline, todos);
  if (error) {
    message(error, true);
    titleInput.focus();
    return;
  }
  const next = { id: crypto.randomUUID(), title, deadline: new Date(deadline).toISOString(), done: false, createdAt: Date.now() };
  if (await commit([...todos, next])) {
    const date = startOfDay(deadline);
    if (date < weekStart || date >= shiftDays(weekStart, 7)) weekStart = date;
    selectedDay = null;
    titleInput.value = "";
    message("기억해 둘게요! 할 일을 추가했어요.");
    render();
    titleInput.focus();
  }
});

$("#previous").addEventListener("click", () => { weekStart = shiftDays(weekStart, -7); selectedDay = null; render(); });
$("#next").addEventListener("click", () => { weekStart = shiftDays(weekStart, 7); selectedDay = null; render(); });
$("#today").addEventListener("click", () => { weekStart = startOfDay(); selectedDay = null; render(); });
$("#all-days").addEventListener("click", () => { selectedDay = null; render(); });

async function init() {
  const defaultDeadline = new Date();
  defaultDeadline.setHours(23, 59, 0, 0);
  deadlineInput.value = dateKey(defaultDeadline) + "T23:59";
  setBusy(true);
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY];
    if (data !== undefined && (!Array.isArray(data) || data.some(todo =>
      !todo || typeof todo.id !== "string" || typeof todo.title !== "string" ||
      typeof todo.done !== "boolean" || !Number.isFinite(todo.createdAt) ||
      typeof todo.deadline !== "string" || !Number.isFinite(new Date(todo.deadline).getTime())
    ))) throw new Error("Invalid saved data");
    todos = data || [];
    ready = true;
  } catch {
    message("할 일을 불러오지 못했어요. 창을 닫았다 다시 열어 주세요.", true);
  } finally {
    setBusy(false);
    render();
  }
}
setInterval(render, 60_000);
init();
