const form = document.querySelector("#task-form");
const title = document.querySelector("#task-title");
const due = document.querySelector("#due");
const save = document.querySelector("#save");
const cancel = document.querySelector("#cancel");
const list = document.querySelector("#tasks");
const empty = document.querySelector("#empty");
const error = document.querySelector("#error");
const filters = document.querySelector("nav");
const count = document.querySelector("#count");

let todos = [];
let filter = "all";
let editingId = null;
let saving = false;

function localDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return [date.getFullYear(), month, day].join("-");
}

function report(message = "") {
  error.textContent = message;
  error.hidden = !message;
}

async function mutate(message) {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error);
    report();
    return true;
  } catch (cause) {
    report(cause.message || "변경 내용을 저장하지 못했어요.");
    return false;
  }
}

function action(label, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", handler);
  return button;
}

function edit(todo) {
  editingId = todo.id;
  title.value = todo.text;
  due.value = todo.dueDate || "";
  save.textContent = "저장";
  cancel.hidden = false;
  title.focus();
}

function resetForm() {
  editingId = null;
  form.reset();
  save.textContent = "추가";
  cancel.hidden = true;
}

function status(todo, today) {
  if (todo.done) return "done";
  if (!todo.dueDate) return "unscheduled";
  if (todo.dueDate < today) return "overdue";
  return todo.dueDate === today ? "today" : "upcoming";
}

function render() {
  const now = new Date();
  const today = localDate(now);
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("ko-KR", {
    month: "long", day: "numeric", weekday: "long"
  }).format(now);
  const remaining = todos.filter(todo => !todo.done).length;
  const overdue = todos.filter(todo => status(todo, today) === "overdue").length;
  count.textContent = "남은 할 일 " + remaining + "개 · 지연 " + overdue + "개";

  const visible = todos.filter(todo => filter === "all" || filter === status(todo, today));
  visible.sort((a, b) => Number(a.done) - Number(b.done)
    || (a.dueDate || "~").localeCompare(b.dueDate || "~"));
  list.replaceChildren();
  empty.hidden = visible.length > 0;

  for (const todo of visible) {
    const item = document.createElement("li");
    item.classList.toggle("done", todo.done);
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = todo.done;
    check.setAttribute("aria-label", todo.text + " 완료");
    check.addEventListener("change", async () => {
      check.disabled = true;
      if (!await mutate({ type: "toggle", id: todo.id, done: check.checked })) {
        check.checked = todo.done;
      }
      check.disabled = false;
    });

    const details = document.createElement("div");
    details.className = "task-details";
    const text = document.createElement("span");
    text.className = "task-title";
    text.textContent = todo.text;
    const date = document.createElement("span");
    date.className = "task-date";
    const late = status(todo, today) === "overdue";
    date.classList.toggle("overdue", late);
    date.textContent = (late ? "지연 · " : "") + (todo.dueDate || "마감일 없음");
    details.append(text, date);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (todo.url?.startsWith("https://mail.google.com/")) {
      actions.append(action("메일", () => chrome.tabs.create({ url: todo.url })));
    }
    actions.append(action("수정", () => edit(todo)));
    actions.append(action("삭제", async () => {
      if (!window.confirm("이 할 일을 삭제할까요?")) return;
      if (await mutate({ type: "delete", id: todo.id }) && editingId === todo.id) resetForm();
    }, "delete"));
    item.append(check, details, actions);
    list.append(item);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving) return;
  const text = title.value.trim();
  if (!text) {
    report("할 일을 입력해 주세요.");
    title.focus();
    return;
  }

  saving = true;
  for (const control of form.elements) control.disabled = true;
  const type = editingId === null ? "add" : "edit";
  if (await mutate({ type, id: editingId, text, dueDate: due.value })) {
    resetForm();
    filters.querySelector('[data-filter="all"]').click();
  }
  saving = false;
  for (const control of form.elements) control.disabled = false;
  title.focus();
});

cancel.addEventListener("click", () => {
  resetForm();
  report();
  title.focus();
});

filters.addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  for (const tab of filters.querySelectorAll("button")) {
    tab.setAttribute("aria-pressed", String(tab === button));
  }
  render();
});

let receivedChange = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.todos) return;
  receivedChange = true;
  todos = changes.todos.newValue || [];
  render();
});
chrome.storage.local.get({ todos: [] }).then(data => {
  if (!receivedChange) todos = data.todos;
  render();
  save.disabled = false;
}).catch(() => report("저장된 할 일을 불러오지 못했어요."));
setInterval(render, 60_000);
document.querySelector("#open-puzzle").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("puzzle.html") }).catch(() => {
    report("퍼즐을 열지 못했어요.");
  });
});
