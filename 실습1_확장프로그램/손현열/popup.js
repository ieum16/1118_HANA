const STORAGE_KEY = "todos";
document.querySelector("#app-version").textContent = `v${chrome.runtime.getManifest().version}`;
const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const dueDate = document.querySelector("#due-date");
const repeat = document.querySelector("#repeat");
const important = document.querySelector("#important");
const submitButton = document.querySelector("#submit-button");
const cancelEdit = document.querySelector("#cancel-edit");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");
let todos = [];
let editingId = null;
let busy = true;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextDueDate(todo) {
  const date = new Date(`${todo.dueDate || localDate()}T12:00:00`);
  const today = localDate();
  do {
    date.setDate(date.getDate() + (todo.repeat === "weekly" ? 7 : 1));
  } while (localDate(date) <= today);
  return localDate(date);
}

function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll("#todo-form button, #todo-form input, #todo-form select, #todo-list button, #todo-list input")) {
    control.disabled = value;
  }
}

async function commit(updatedTodos) {
  if (busy) return false;
  setBusy(true);
  error.textContent = "";
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedTodos });
    todos = updatedTodos;
    render();
    return true;
  } catch {
    error.textContent = "저장하지 못했습니다. 다시 시도해 주세요.";
    render();
    return false;
  } finally {
    setBusy(false);
  }
}

function resetEditor() {
  editingId = null;
  form.reset();
  submitButton.textContent = "추가";
  input.setAttribute("aria-label", "새 할 일");
  cancelEdit.hidden = true;
}

function editTodo(todo) {
  editingId = todo.id;
  input.value = todo.text;
  dueDate.value = todo.dueDate || "";
  repeat.value = todo.repeat || "none";
  important.checked = Boolean(todo.important);
  submitButton.textContent = "저장";
  input.setAttribute("aria-label", "할 일 수정");
  cancelEdit.hidden = false;
  error.textContent = "";
  input.focus();
}

function actionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function render() {
  list.replaceChildren();
  const sorted = [...todos].sort((a, b) => Number(Boolean(b.important)) - Number(Boolean(a.important)));
  for (const todo of sorted) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.addEventListener("change", async () => {
      const updated = todos.map((entry) => ({ ...entry }));
      const changed = updated.find((entry) => entry.id === todo.id);
      changed.completed = checkbox.checked;
      if (changed.completed && ["daily", "weekly"].includes(changed.repeat) && !changed.nextOccurrenceId) {
        const nextId = makeId();
        updated.unshift({
          id: nextId,
          text: changed.text,
          completed: false,
          important: Boolean(changed.important),
          dueDate: nextDueDate(changed),
          repeat: changed.repeat,
        });
        changed.nextOccurrenceId = nextId;
      }
      await commit(updated);
    });
    const content = document.createElement("div");
    content.className = "todo-content";
    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;
    content.append(text);
    const details = [];
    if (todo.dueDate) details.push(`마감 ${todo.dueDate}`);
    if (todo.repeat === "daily") details.push("매일 반복");
    if (todo.repeat === "weekly") details.push("매주 반복");
    if (details.length) {
      const metadata = document.createElement("small");
      metadata.className = "todo-metadata";
      if (!todo.completed && todo.dueDate && todo.dueDate < localDate()) {
        metadata.classList.add("overdue");
        details.push("기한 지남");
      }
      metadata.textContent = details.join(" · ");
      content.append(metadata);
    }
    const star = actionButton(todo.important ? "★" : "☆", "star-button", async () => {
      await commit(todos.map((entry) => entry.id === todo.id ? { ...entry, important: !entry.important } : entry));
    });
    star.setAttribute("aria-label", `${todo.text} 중요 표시`);
    star.setAttribute("aria-pressed", String(Boolean(todo.important)));
    const edit = actionButton("수정", "edit-button", () => editTodo(todo));
    edit.setAttribute("aria-label", `${todo.text} 수정`);
    const remove = actionButton("×", "delete-button", async () => {
      if (await commit(todos.filter((entry) => entry.id !== todo.id))) {
        if (editingId === todo.id) resetEditor();
      }
    });
    remove.setAttribute("aria-label", `${todo.text} 삭제`);
    const actions = document.createElement("div");
    actions.className = "todo-actions";
    actions.append(star, edit, remove);
    item.append(checkbox, content, actions);
    list.append(item);
  }
  remaining.textContent = `남은 할 일 ${todos.filter((todo) => !todo.completed).length}개`;
  emptyMessage.hidden = todos.length > 0;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text || !dueDate.validity.valid) {
    error.textContent = text ? "올바른 마감일을 입력해 주세요." : "할 일을 입력해 주세요.";
    return;
  }
  const values = {
    text,
    important: important.checked,
    dueDate: dueDate.value || (repeat.value !== "none" ? localDate() : ""),
    repeat: repeat.value,
  };
  const updated = editingId
    ? todos.map((todo) => todo.id === editingId ? { ...todo, ...values } : todo)
    : [{ id: makeId(), completed: false, ...values }, ...todos];
  if (await commit(updated)) {
    resetEditor();
    input.focus();
  }
});

cancelEdit.addEventListener("click", () => {
  resetEditor();
  error.textContent = "";
  input.focus();
});

async function loadTodos() {
  setBusy(true);
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    todos = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    render();
    setBusy(false);
  } catch {
    error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
  }
}

loadTodos();
