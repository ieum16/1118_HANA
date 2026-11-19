"use strict";

const storage = chrome.storage.local;
const form = document.querySelector("#task-form");
const composer = document.querySelector("#composer");
const summary = composer.querySelector("summary");
const submit = form.querySelector("button[type=submit]");
const cancelEdit = document.querySelector("#cancel-edit");
const titleInput = form.elements.title;
const personInput = form.elements.person;
const dateInput = form.elements.date;
const timeInput = form.elements.time;
const deadlineInput = form.elements.deadline;
const fields = [titleInput, personInput, dateInput, timeInput, deadlineInput];
const addDate = document.querySelector("#add-date");
const dateList = document.querySelector("#dates");
const counter = document.querySelector("#count");
const message = document.querySelector("#message");
const groups = document.querySelector("#groups");
const progress = document.querySelector("#progress");
const empty = document.querySelector("#empty");

const selectedDates = new Set();
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric", month: "short", day: "numeric", weekday: "short"
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric", minute: "2-digit"
});

let tasks = [];
let saving = false;
let editing = null;
let addDraft = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return [now.getFullYear(), month, day].join("-");
}

function normalize(text) {
  return text.trim().normalize("NFC").replace(/\s+/gu, " ");
}

function showMessage(text, error = false) {
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle("error", error);
}

function formatDate(value) {
  return dateFormat.format(new Date(value));
}

function formatDateTime(value) {
  const date = new Date(value);
  return formatDate(value) + " · " + timeFormat.format(date);
}

function validateText(input) {
  const length = Array.from(segmenter.segment(input.value)).length;
  input.setCustomValidity(length > 20 ? "20자 이내로 입력해 주세요." : "");
  if (input === titleInput) counter.textContent = length + " / 20";
}

function renderSelectedDates() {
  dateList.replaceChildren();
  for (const date of [...selectedDates].sort()) {
    const item = element("li");
    const button = element("button", "", date + " ×");
    button.type = "button";
    button.setAttribute("aria-label", date + " 삭제");
    button.addEventListener("click", () => {
      selectedDates.delete(date);
      renderSelectedDates();
      dateInput.focus();
    });
    item.append(button);
    dateList.append(item);
  }
}

function renderOccurrence(task, occurrence) {
  const item = element("li", "occurrence");
  const label = element("label");
  const checkbox = element("input");
  checkbox.type = "checkbox";
  checkbox.checked = occurrence.done;
  checkbox.dataset.task = task.id;
  checkbox.dataset.date = occurrence.date;

  const scheduled = occurrence.date + "T" + occurrence.time;
  const time = element("time", "schedule", formatDateTime(scheduled));
  time.dateTime = scheduled;
  checkbox.setAttribute("aria-label", task.title + " · " + time.textContent + " 완료");
  const schedule = element("span");
  schedule.append(time);
  label.append(checkbox, schedule);

  const edit = element("button", "secondary", "수정");
  edit.type = "button";
  edit.dataset.editTask = task.id;
  edit.dataset.date = occurrence.date;
  edit.setAttribute("aria-label", task.title + " · " + time.textContent + " 수정");
  edit.addEventListener("click", () => startEditing(task, occurrence));

  const actions = element("div", "date-field");
  actions.append(label, edit);
  item.append(actions);

  const deadline = element("small", "deadline");
  if (occurrence.deadline) {
    deadline.dataset.deadline = occurrence.deadline;
    if (occurrence.done) deadline.dataset.done = "true";
  } else {
    deadline.textContent = "만료기한 없음";
  }
  item.append(deadline);
  return item;
}

function refreshDeadlines() {
  const now = Date.now();
  for (const node of groups.querySelectorAll("[data-deadline]")) {
    const expired = node.dataset.done !== "true" && Date.parse(node.dataset.deadline) <= now;
    node.classList.toggle("overdue", expired);
    node.textContent = (expired ? "만료됨 " : "만료기한 ") + formatDateTime(node.dataset.deadline);
  }
}

function renderTasks() {
  const byPerson = new Map();
  let total = 0;
  let complete = 0;
  for (const task of tasks) {
    const entries = byPerson.get(task.person) ?? [];
    entries.push(task);
    byPerson.set(task.person, entries);
    total += task.occurrences.length;
    complete += task.occurrences.filter(({ done }) => done).length;
  }

  progress.textContent = total ? complete + " / " + total + " 완료" : "";
  empty.hidden = total > 0;
  groups.replaceChildren();

  const people = [...byPerson.keys()].sort((a, b) => a.localeCompare(b, "ko"));
  for (const person of people) {
    const group = element("section", "group");
    const heading = element("h3", "", person || "혼자 하는 일");
    const list = element("ul", "tasks");
    for (const task of byPerson.get(person)) {
      const item = element("li", "task");
      const allDone = task.occurrences.every(({ done }) => done);
      const taskTitle = element("p", allDone ? "task-title done" : "task-title", task.title);
      const occurrences = element("ul", "occurrences");
      for (const occurrence of task.occurrences) {
        occurrences.append(renderOccurrence(task, occurrence));
      }
      item.append(taskTitle, occurrences);
      list.append(item);
    }
    group.append(heading, list);
    groups.append(group);
  }
  refreshDeadlines();
}

async function saveTasks(nextTasks) {
  saving = true;
  try {
    await storage.set({ tasks: nextTasks });
    tasks = nextTasks;
    return true;
  } catch {
    showMessage("저장하지 못했어요. 다시 시도해 주세요.", true);
    return false;
  } finally {
    saving = false;
  }
}

function refreshForm() {
  const isEditing = editing !== null;
  summary.textContent = isEditing ? "일정 수정" : "할 일 추가";
  submit.textContent = isEditing ? "변경 저장" : "저장";
  addDate.hidden = isEditing;
  cancelEdit.hidden = !isEditing;
  dateInput.required = isEditing;
  validateText(titleInput);
  validateText(personInput);
  renderSelectedDates();
}

function startEditing(task, occurrence) {
  if (saving) return;
  if (editing?.taskId === task.id && editing.date === occurrence.date) {
    composer.open = true;
    titleInput.focus();
    return;
  }
  if (!editing) {
    addDraft = {
      values: fields.map((field) => field.value),
      dates: [...selectedDates],
      open: composer.open
    };
  }

  editing = { taskId: task.id, date: occurrence.date };
  titleInput.value = task.title;
  personInput.value = task.person;
  dateInput.value = occurrence.date;
  timeInput.value = occurrence.time;
  deadlineInput.value = occurrence.deadline;
  selectedDates.clear();
  refreshForm();
  showMessage("");
  composer.open = true;
  titleInput.focus();
}

function finishEditing(location) {
  editing = null;
  fields.forEach((field, index) => { field.value = addDraft.values[index]; });
  for (const date of addDraft.dates) selectedDates.add(date);
  composer.open = addDraft.open;
  addDraft = null;
  refreshForm();

  const taskId = CSS.escape(location.taskId);
  const date = CSS.escape(location.date);
  const edit = groups.querySelector(`[data-edit-task="${taskId}"][data-date="${date}"]`);
  (edit ?? summary).focus();
}

function applyEdit(nextTasks, title, person) {
  const source = nextTasks.find(({ id }) => id === editing.taskId);
  const original = source?.occurrences.find(({ date }) => date === editing.date);
  if (!original) {
    showMessage("수정할 일정을 찾지 못했어요.", true);
    return null;
  }

  const date = dateInput.value;
  let target = nextTasks.find((task) => task.title === title && task.person === person);
  if (target?.occurrences.some((entry) => entry !== original && entry.date === date)) {
    showMessage("이 할 일은 해당 날짜에 이미 등록되어 있어요.", true);
    dateInput.focus();
    return null;
  }

  if (!target) {
    if (source.occurrences.length === 1) {
      target = source;
      target.title = title;
      target.person = person;
    } else {
      target = { id: crypto.randomUUID(), title, person, occurrences: [] };
      nextTasks.push(target);
    }
  }

  source.occurrences.splice(source.occurrences.indexOf(original), 1);
  target.occurrences.push({
    ...original,
    date,
    time: timeInput.value,
    deadline: deadlineInput.value
  });
  sortOccurrences(target);
  if (!source.occurrences.length) nextTasks.splice(nextTasks.indexOf(source), 1);
  return { taskId: target.id, date };
}

function sortOccurrences(task) {
  task.occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

async function saveFromForm(nextTasks) {
  submit.disabled = true;
  const saved = await saveTasks(nextTasks);
  submit.disabled = false;
  if (saved) renderTasks();
  return saved;
}

cancelEdit.addEventListener("click", () => {
  if (saving || !editing) return;
  finishEditing(editing);
  showMessage("");
});

titleInput.addEventListener("input", () => validateText(titleInput));
personInput.addEventListener("input", () => validateText(personInput));

addDate.addEventListener("click", () => {
  if (!dateInput.value || !dateInput.checkValidity()) {
    showMessage("추가할 날짜를 선택해 주세요.", true);
    dateInput.focus();
    return;
  }
  selectedDates.add(dateInput.value);
  dateInput.value = "";
  renderSelectedDates();
  showMessage("");
  dateInput.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving) return;

  const title = normalize(titleInput.value);
  const person = normalize(personInput.value);
  validateText(titleInput);
  validateText(personInput);
  if (!form.reportValidity()) return;
  if (!title) {
    showMessage("할 일을 입력해 주세요.", true);
    titleInput.focus();
    return;
  }

  const nextTasks = structuredClone(tasks);
  if (editing) {
    const updated = applyEdit(nextTasks, title, person);
    if (updated && await saveFromForm(nextTasks)) {
      finishEditing(updated);
      showMessage("일정을 수정했어요.");
    }
    return;
  }

  const dates = new Set(selectedDates);
  if (dateInput.value) dates.add(dateInput.value);
  if (!dates.size) {
    showMessage("해야 할 날짜를 하나 이상 선택해 주세요.", true);
    dateInput.focus();
    return;
  }

  let task = nextTasks.find((entry) => entry.title === title && entry.person === person);
  if (!task) {
    task = { id: crypto.randomUUID(), title, person, occurrences: [] };
    nextTasks.push(task);
  }

  const existingDates = new Set(task.occurrences.map(({ date }) => date));
  const newDates = [...dates].filter((date) => !existingDates.has(date));
  if (!newDates.length) {
    showMessage("선택한 날짜는 이미 등록되어 있어요.", true);
    return;
  }

  for (const date of newDates) {
    task.occurrences.push({
      date,
      time: timeInput.value,
      deadline: deadlineInput.value,
      done: false
    });
  }
  sortOccurrences(task);
  if (!await saveFromForm(nextTasks)) return;

  form.reset();
  selectedDates.clear();
  dateInput.value = localToday();
  refreshForm();
  composer.open = false;
  showMessage(newDates.length + "개 날짜에 저장했어요.");
  summary.focus();
});

groups.addEventListener("change", async (event) => {
  const checkbox = event.target;
  if (!checkbox.matches("input[data-task]")) return;
  const { task, date } = checkbox.dataset;
  const nextTasks = structuredClone(tasks);
  const occurrence = nextTasks.find((entry) => entry.id === task)
    ?.occurrences.find((entry) => entry.date === date);
  if (!occurrence) return;
  if (saving) {
    checkbox.checked = occurrence.done;
    return;
  }
  occurrence.done = checkbox.checked;
  checkbox.disabled = true;
  if (await saveTasks(nextTasks)) {
    showMessage("");
    renderTasks();
    for (const input of groups.querySelectorAll("input[data-task]")) {
      if (input.dataset.task === task && input.dataset.date === date) {
        input.focus();
        break;
      }
    }
  } else {
    checkbox.checked = !checkbox.checked;
    checkbox.disabled = false;
    checkbox.focus();
  }
});

async function initialize() {
  dateInput.value = localToday();
  submit.disabled = true;
  try {
    const result = await storage.get({ tasks: [] });
    tasks = result.tasks;
    composer.open = !tasks.length;
    renderTasks();
    submit.disabled = false;
    setInterval(refreshDeadlines, 15000);
  } catch {
    showMessage("저장된 목록을 읽지 못했어요. 팝업을 다시 열어 주세요.", true);
  }
}

initialize();