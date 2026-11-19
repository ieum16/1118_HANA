const storageKey = "today-tasks";
const form = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const tagInput = document.querySelector("#task-tag");
const list = document.querySelector("#tasks");
const empty = document.querySelector("#empty");
const remaining = document.querySelector("#remaining strong");
const feedback = document.querySelector("#feedback");
const dateLabel = document.querySelector("#task-date");
const completion = document.querySelector("#task-completion");
const progress = document.querySelector("#task-progress");
const tagNames = new Map([
  ["deadline", "D-1"],
  ["organize", "업무정리"],
  ["design", "디자인"],
]);
let tasks = [];

const today = new Date();
dateLabel.textContent = `${today.getMonth() + 1}/${today.getDate()}`;

function showFeedback(message = "") {
  feedback.textContent = message;
  feedback.hidden = !message;
  taskInput.removeAttribute("aria-invalid");
}

function updateSummary() {
  const completed = tasks.filter((task) => task.done).length;
  empty.hidden = tasks.length > 0;
  remaining.textContent = `${tasks.length - completed}개`;
  completion.textContent = `${completed}/${tasks.length} 완료`;
  progress.max = Math.max(tasks.length, 1);
  progress.value = completed;
}

function normalizeTaskText(text) {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function saveTasks(nextTasks) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextTasks));
  } catch {
    showFeedback("저장하지 못했어요. 다시 시도해 주세요.");
    return false;
  }

  tasks = nextTasks;
  showFeedback();
  updateSummary();
  return true;
}

function createTaskRow(task) {
  const row = document.createElement("li");
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  const text = document.createElement("span");
  const deleteButton = document.createElement("button");

  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  text.textContent = task.text;

  checkbox.addEventListener("change", () => {
    const done = checkbox.checked;
    const nextTasks = tasks.map((item) => item.id === task.id ? { ...item, done } : item);
    if (!saveTasks(nextTasks)) {
      checkbox.checked = !done;
    }
  });

  deleteButton.type = "button";
  deleteButton.className = "delete";
  deleteButton.textContent = "삭제";
  deleteButton.setAttribute("aria-label", `${task.text} 삭제`);
  deleteButton.addEventListener("click", () => {
    const nextTasks = tasks.filter((item) => item.id !== task.id);
    if (saveTasks(nextTasks)) {
      const adjacentRow = row.nextElementSibling ?? row.previousElementSibling;
      row.remove();
      (adjacentRow?.querySelector(".delete") ?? taskInput).focus();
    }
  });

  label.append(checkbox, text);
  row.append(label);
  if (tagNames.has(task.tag)) {
    const badge = document.createElement("span");
    badge.className = `task-badge task-badge--${task.tag}`;
    badge.textContent = tagNames.get(task.tag);
    row.append(badge);
  }
  row.append(deleteButton);
  return row;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  const normalizedText = normalizeTaskText(text);
  let message = "";
  if (!normalizedText) {
    message = "할 일을 입력해 주세요.";
  } else if (tasks.some((task) => normalizeTaskText(task.text) === normalizedText)) {
    message = "이미 목록에 있는 할 일이에요.";
  }

  if (message) {
    showFeedback(message);
    taskInput.setAttribute("aria-invalid", "true");
    taskInput.focus();
    return;
  }

  const task = { id: crypto.randomUUID(), text, done: false };
  if (tagNames.has(tagInput.value)) task.tag = tagInput.value;
  if (saveTasks([...tasks, task])) {
    list.append(createTaskRow(task));
    form.reset();
    taskInput.focus();
  }
});

taskInput.addEventListener("input", () => showFeedback());

try {
  tasks = JSON.parse(localStorage.getItem(storageKey)) ?? [];
  list.append(...tasks.map(createTaskRow));
  updateSummary();
} catch {
  form.querySelector("button").disabled = true;
  taskInput.disabled = true;
  showFeedback("목록을 불러오지 못했어요. 창을 다시 열어 주세요.");
}
