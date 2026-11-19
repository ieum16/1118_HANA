"use strict";

const STORAGE_KEY = "todayTodos";
const form = document.querySelector("#todo-form");
const composer = document.querySelector("#composer");
const textInput = document.querySelector("#todo-input");
const deadlineInput = document.querySelector("#deadline-date");
const list = document.querySelector("#todo-list");
const message = document.querySelector("#message");
let todos = [];
let busy = false;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCreated(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
}

// Compare calendar days, so daylight-saving changes cannot shift a deadline.
function remainingDays(deadline, now = new Date()) {
  const [year, month, day] = deadline.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function deadlineFromDays(days, now = new Date()) {
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + days);
  return dateKey(deadline);
}

function enableCalendar(input) {
  input.addEventListener("click", () => {
    // Open the native calendar from the whole date field, not just its icon.
    if (typeof input.showPicker === "function" && !input.disabled) {
      try { input.showPicker(); } catch { /* Native date editing remains available. */ }
    }
  });
}

function updatePresets() {
  document.querySelectorAll(".preset[data-days]").forEach((button) => {
    button.setAttribute("aria-pressed", String(deadlineInput.value === deadlineFromDays(Number(button.dataset.days))));
  });
}

function render() {
  document.querySelector("#today").textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const completed = todos.filter((todo) => todo.completed).length;
  document.querySelector("#remaining").textContent = todos.length - completed;
  document.querySelector("#completed").textContent = `전체 ${todos.length}개 · 완료 ${completed}개`;
  document.querySelector("#empty").hidden = todos.length !== 0;
  list.replaceChildren();

  for (const todo of todos) {
    const card = document.querySelector("#todo-template").content.firstElementChild.cloneNode(true);
    card.classList.toggle("is-complete", todo.completed);
    card.querySelector(".task-text").textContent = todo.text;
    card.querySelector(".created").textContent = `추가 ${formatCreated(todo.createdAt)}`;
    const check = card.querySelector(".task-check");
    check.checked = todo.completed;
    check.setAttribute("aria-label", `${todo.text} 완료`);
    check.addEventListener("change", () => updateTodo(todo.id, { completed: check.checked }));
    const remove = card.querySelector(".delete-button");
    remove.setAttribute("aria-label", `${todo.text} 삭제`);
    remove.addEventListener("click", () => persist(todos.filter((item) => item.id !== todo.id)));
    const dateInput = card.querySelector(".deadline-date");
    dateInput.value = todo.deadline || "";
    dateInput.min = "1900-01-01";
    dateInput.max = "9999-12-31";
    dateInput.setAttribute("aria-label", `${todo.text} 마감일 변경`);
    enableCalendar(dateInput);
    dateInput.addEventListener("change", () => {
      if (dateInput.validity.valid) updateTodo(todo.id, { deadline: dateInput.value || null });
      else message.textContent = "올바른 마감일을 입력해 주세요.";
    });
    const badge = card.querySelector(".deadline-badge");
    if (todo.deadline) {
      const days = remainingDays(todo.deadline);
      badge.textContent = days > 0 ? `D-${days}` : days === 0 ? "D-Day" : `D+${Math.abs(days)}`;
      badge.classList.toggle("urgent", days >= 0 && days <= 3);
      badge.classList.toggle("overdue", days < 0);
      badge.title = `마감일 ${todo.deadline}`;
    } else {
      badge.textContent = "마감 없음";
    }
    list.append(card);
  }
}

async function persist(nextTodos) {
  if (busy) return false;
  busy = true;
  message.textContent = "";
  composer.disabled = true;
  list.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: nextTodos });
    todos = nextTodos;
    return true;
  } catch (error) {
    console.error("할 일 저장 실패", error);
    message.textContent = "저장하지 못했어요. 다시 시도해 주세요.";
    return false;
  } finally {
    busy = false;
    composer.disabled = false;
    render();
  }
}

function updateTodo(id, changes) {
  return persist(todos.map((todo) => todo.id === id ? { ...todo, ...changes } : todo));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const text = textInput.value.trim();
  if (!text) {
    message.textContent = "할 일을 입력해 주세요. 빈칸만 추가할 수는 없어요.";
    textInput.focus();
    return;
  }
  if (!deadlineInput.validity.valid) {
    message.textContent = "올바른 마감일을 선택해 주세요.";
    deadlineInput.focus();
    return;
  }
  const todo = {
    id: crypto.randomUUID(), text, completed: false,
    createdAt: new Date().toISOString(),
    deadline: deadlineInput.value || null
  };
  if (await persist([todo, ...todos])) {
    form.reset();
    updatePresets();
    textInput.focus();
  }
});

enableCalendar(deadlineInput);
deadlineInput.addEventListener("change", updatePresets);
document.querySelector("#clear-deadline").addEventListener("click", () => {
  deadlineInput.value = "";
  updatePresets();
});
document.querySelectorAll(".preset[data-days]").forEach((button) => {
  button.addEventListener("click", () => {
    deadlineInput.value = deadlineFromDays(Number(button.dataset.days));
    updatePresets();
  });
});

async function initialize() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored[STORAGE_KEY] !== undefined && !Array.isArray(stored[STORAGE_KEY])) {
      throw new Error("저장된 목록 형식이 올바르지 않습니다.");
    }
    todos = stored[STORAGE_KEY] || [];
    render();
    composer.disabled = false;
    textInput.focus();
  } catch (error) {
    console.error("할 일 불러오기 실패", error);
    message.textContent = "목록을 불러오지 못했어요. 확장 프로그램을 다시 열어 주세요.";
  }
}

initialize();
// Refresh D-day labels if the popup stays open across midnight.
setInterval(() => { if (!busy) render(); }, 60000);
