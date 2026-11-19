"use strict";

const KEY = "daily-todos-v1";
const $ = id => document.getElementById(id);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
let selected = dateKey(new Date());
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let records = {};
let busy = false;
let ready = false;

function tasksFor(key) { return records[key] || []; }
function complete(key) { const tasks = tasksFor(key); return tasks.length > 0 && tasks.every(task => task.done); }
function renderCalendar() {
  $("month").textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
  $("days").replaceChildren();
  const today = dateKey(new Date());
  for (let i = 0; i < month.getDay(); i++) $("days").append(document.createElement("span"));
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= count; day++) {
    const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
    const button = document.createElement("button");
    const allDone = complete(key);
    button.type = "button";
    button.className = "day";
    button.classList.toggle("selected", key === selected);
    button.classList.toggle("is-today", key === today);
    button.classList.toggle("complete", allDone);
    button.setAttribute("aria-pressed", String(key === selected));
    if (key === today) button.setAttribute("aria-current", "date");
    button.setAttribute("aria-label", `${month.getMonth() + 1}월 ${day}일${allDone ? ", 모두 완료" : tasksFor(key).length ? `, 할 일 ${tasksFor(key).length}개` : ""}`);
    button.textContent = day;
    if (tasksFor(key).length) {
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = allDone ? "✓" : "•";
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.onclick = () => { selected = key; $("message").textContent = ""; render(); };
    $("days").append(button);
  }
}

function render() {
  renderCalendar();
  const tasks = tasksFor(selected);
  const remaining = tasks.filter(task => !task.done).length;
  const date = parseDate(selected);
  $("selected-date").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][date.getDay()]})`;
  $("remaining").textContent = `남은 ${remaining}개`;
  $("encouragement").textContent = complete(selected) ? "모두 해냈어요! 달력에 체크를 남겼어요 🌿" : "작은 실천이 멋진 하루를 만들어요.";
  $("empty").hidden = tasks.length > 0;
  $("task").disabled = $("add").disabled = !ready || busy;
  $("list").replaceChildren();
  for (const task of tasks) {
    const item = document.createElement("li");
    item.classList.toggle("done", task.done);
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = task.done;
    check.disabled = busy;
    check.onchange = () => mutate(selected, list => list.map(t => t.id === task.id ? { ...t, done: check.checked } : t));
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    label.append(check, text);
    const remove = document.createElement("button");
    remove.className = "delete";
    remove.textContent = "삭제";
    remove.disabled = busy;
    remove.setAttribute("aria-label", `${task.text} 삭제`);
    remove.onclick = () => mutate(selected, list => list.filter(t => t.id !== task.id));
    item.append(label, remove);
    $("list").append(item);
  }
}

async function mutate(key, update) {
  if (busy || !ready) return false;
  busy = true;
  const previous = records;
  records = { ...records, [key]: update(tasksFor(key)) };
  render();
  try {
    await chrome.storage.local.set({ [KEY]: records });
    $("save-status").textContent = "이 기기에 자동으로 저장됐어요";
    $("message").textContent = "";
    return true;
  } catch {
    records = previous;
    $("message").textContent = "저장하지 못했어요. 다시 시도해 주세요.";
    return false;
  } finally { busy = false; render(); }
}

$("form").onsubmit = async event => {
  event.preventDefault();
  const text = $("task").value.trim();
  if (!text) { $("message").textContent = "할 일을 먼저 입력해 주세요."; $("task").focus(); return; }
  const saved = await mutate(selected, list => [...list, { id: crypto.randomUUID(), text, done: false }]);
  if (saved) { $("task").value = ""; $("task").focus(); }
};
$("prev").onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); };
$("next").onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); };
$("today").onclick = () => { const now = new Date(); selected = dateKey(now); month = new Date(now.getFullYear(), now.getMonth(), 1); render(); };

async function init() {
  render();
  try {
    const saved = (await chrome.storage.local.get(KEY))[KEY];
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const [key, tasks] of Object.entries(saved)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(tasks)) {
          records[key] = tasks.filter(t => t && typeof t.id === "string" && typeof t.text === "string" && t.text.trim()).map(t => ({ id: t.id, text: t.text, done: t.done === true }));
        }
      }
    }
    ready = true;
  } catch { $("message").textContent = "목록을 불러오지 못했어요. 창을 닫고 다시 열어 주세요."; }
  render();
}
init();
