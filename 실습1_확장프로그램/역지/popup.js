"use strict";

async function verifyFont() {
  const indicator = document.getElementById("font-status");
  try {
    const loaded = await document.fonts.load('18px "BM Jua"', "할 일 목록 우사기");
    if (loaded.length === 0) throw new Error("Font not loaded");
    indicator.dataset.loaded = "true";
    indicator.textContent = "배민 주아체 적용됨 · v1.2.1";
  } catch {
    indicator.dataset.loaded = "false";
    indicator.textContent = "주아체 로드 실패 · 확장 프로그램을 새로고침해 주세요";
  }
}
verifyFont();

const ui = Object.fromEntries([
  "today", "add-form", "task-input", "add-button", "status", "today-list",
  "later-list", "today-count", "later-count", "today-empty", "later-empty"
].map(id => [id, document.getElementById(id)]));
let tasks = [];
let busy = true;

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

function setStatus(message, error = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", error);
}

function render() {
  const today = dateKey();
  ui.today.textContent = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  ui["today-list"].replaceChildren();
  ui["later-list"].replaceChildren();
  const groups = { today: [], later: [] };
  for (const task of tasks) groups[task.due > today ? "later" : "today"].push(task);

  for (const [group, items] of Object.entries(groups)) {
    ui[`${group}-count`].textContent = `${items.filter(task => task.completed).length}/${items.length}`;
    ui[`${group}-empty`].hidden = items.length > 0 || busy;
    for (const task of items) {
      const row = document.createElement("li");
      row.className = `task${task.completed ? " done" : ""}`;
      const label = document.createElement("label");
      label.className = "task-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.completed;
      checkbox.disabled = busy;
      checkbox.addEventListener("change", () => {
        const checked = checkbox.checked;
        commit(tasks.map(item => item.id === task.id ? { ...item, completed: checked } : item), "완료 상태를 저장했어요.");
      });
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      label.append(checkbox, text);
      row.append(label);
      if (group === "later") {
        const due = document.createElement("p");
        due.className = "due";
        due.textContent = `예정일: ${task.due.replaceAll("-", ".")}`;
        row.append(due);
      }
      const actions = document.createElement("div");
      actions.className = "task-actions";
      if (!task.completed && task.due <= today) {
        const postpone = document.createElement("button");
        postpone.type = "button";
        postpone.className = "postpone";
        postpone.textContent = "내일로 미루기 →";
        postpone.setAttribute("aria-label", `${task.text} 내일로 미루기`);
        postpone.disabled = busy;
        postpone.addEventListener("click", () => commit(
          tasks.map(item => item.id === task.id ? { ...item, due: tomorrowKey() } : item),
          "내일 할 일로 옮겼어요."
        ));
        actions.append(postpone);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-task";
      remove.textContent = "삭제";
      remove.setAttribute("aria-label", `${task.text} 삭제`);
      remove.disabled = busy;
      remove.addEventListener("click", () => commit(
        tasks.filter(item => item.id !== task.id), "할 일을 삭제했어요."
      ));
      actions.append(remove);
      row.append(actions);
      ui[`${group}-list`].append(row);
    }
  }
  ui["task-input"].disabled = busy;
  ui["add-button"].disabled = busy;
}

async function commit(nextTasks, message, afterSave) {
  if (busy) return;
  busy = true;
  render();
  setStatus("저장하는 중이에요.");
  try {
    await chrome.storage.local.set({ tasks: nextTasks });
    tasks = nextTasks;
    if (afterSave) afterSave();
    setStatus(message);
  } catch (error) {
    setStatus("저장하지 못했어요. 다시 시도해 주세요.", true);
  } finally {
    busy = false;
    render();
  }
}

ui["add-form"].addEventListener("submit", async event => {
  event.preventDefault();
  const text = ui["task-input"].value.trim();
  if (!text || busy) return;
  await commit([...tasks, { id: crypto.randomUUID(), text, completed: false, due: dateKey() }],
    "새 할 일을 저장했어요.", () => { ui["task-input"].value = ""; });
  ui["task-input"].focus();
});

async function initialize() {
  try {
    const saved = await chrome.storage.local.get({ tasks: [] });
    if (!Array.isArray(saved.tasks) || saved.tasks.some(task => !task ||
      typeof task.id !== "string" || typeof task.text !== "string" ||
      typeof task.completed !== "boolean" || typeof task.due !== "string")) {
      throw new Error("Invalid saved tasks");
    }
    tasks = saved.tasks;
    busy = false;
    render();
    setStatus("오늘도 하나씩 해 봐요.");
    ui["task-input"].focus();
  } catch (error) {
    setStatus("목록을 불러오지 못했어요. 창을 다시 열어 주세요.", true);
  }
}

// Reclassify postponed tasks when the local date changes while the popup is open.
setInterval(() => { if (!busy) render(); }, 30000);
initialize();
