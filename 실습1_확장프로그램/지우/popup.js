"use strict";

const storageKey = "tasks";
const form = document.querySelector("#add-form");
const input = document.querySelector("#task-input");
const addButton = document.querySelector("#add-button");
const pendingList = document.querySelector("#pending");
const doneList = document.querySelector("#done");
const doneSection = document.querySelector("#done-section");
const empty = document.querySelector("#empty");
const template = document.querySelector("#task-template");
const count = document.querySelector("#progress-count");
const progress = document.querySelector("#progress-bar");
const stage = document.querySelector("#stage");
const message = document.querySelector("#message");
const error = document.querySelector("#error");
const friends = {
  chiikawa: "치이카와",
  hachiware: "하치와레",
  usagi: "우사기"
};
const reactions = {
  add: {
    friend: "chiikawa",
    lines: [
      "으, 응! 하나씩 같이 해 보자.",
      "조금씩 해도 괜찮아. 나도 같이 할게!",
      "하나 적었으니까… 이제 시작해 볼까?"
    ],
    next: 0
  },
  important: {
    friend: "hachiware",
    lines: ["별표 붙였네! 잊지 않고 챙길 수 있겠다."],
    next: 0
  },
  complete: {
    friend: "usagi",
    lines: [
      "야하! 하나 해냈다!",
      "우라! 멋지게 끝냈다!",
      "야하! 기세 좋다!"
    ],
    next: 0
  }
};
const cheers = [
  ["chiikawa", "다, 다 해냈어!"],
  ["hachiware", "오늘도 잘했어!"],
  ["usagi", "야하! 우라!"]
];

let tasks = [];
let saving = false;
let reactingFriends = [];

function makeBubble(text, friend) {
  const bubble = document.createElement("span");
  bubble.className = "bubble";
  if (friend) {
    const speaker = document.createElement("strong");
    speaker.className = "speaker";
    speaker.textContent = friends[friend];
    bubble.append(speaker, " ");
  }
  bubble.append(text);
  return bubble;
}

function showReaction(lines, celebrating = false) {
  for (const friend of reactingFriends) friend.classList.remove("is-reacting");
  stage.classList.remove("is-celebrating");
  reactingFriends = lines.filter(([id]) => id).map(([id]) => document.getElementById(id));
  message.replaceChildren(...lines.map(([id, text]) => makeBubble(text, id)));
  void stage.offsetWidth;
  stage.classList.toggle("is-celebrating", celebrating);
  for (const friend of reactingFriends) friend.classList.add("is-reacting");
}

function react(kind) {
  if (kind === "allDone") {
    showReaction(cheers, true);
    return;
  }

  const reaction = reactions[kind];
  showReaction([[reaction.friend, reaction.lines[reaction.next]]]);
  reaction.next = (reaction.next + 1) % reaction.lines.length;
}

function renderTask(task, rank, pendingCount) {
  const row = template.content.firstElementChild.cloneNode(true);
  row.dataset.id = task.id;
  row.classList.toggle("is-important", task.important);
  row.querySelector(".task-name").textContent = task.title;

  const rankLabel = row.querySelector(".rank");
  rankLabel.hidden = task.done;
  rankLabel.textContent = rank;

  const checkbox = row.querySelector(".check");
  checkbox.checked = task.done;
  checkbox.setAttribute("aria-label", `${task.title} 완료`);

  const star = row.querySelector(".star");
  star.textContent = task.important ? "★" : "☆";
  star.setAttribute("aria-label", `${task.title} 중요 표시`);
  star.setAttribute("aria-pressed", String(task.important));

  const up = row.querySelector(".up");
  const down = row.querySelector(".down");
  up.hidden = down.hidden = task.done;
  up.disabled = rank === 1;
  down.disabled = rank === pendingCount;
  up.setAttribute("aria-label", `${task.title} 위로 이동`);
  down.setAttribute("aria-label", `${task.title} 아래로 이동`);
  row.querySelector(".delete").setAttribute("aria-label", `${task.title} 삭제`);
  return row;
}

function render() {
  const pending = tasks.filter(task => !task.done);
  const done = tasks.filter(task => task.done);
  pendingList.replaceChildren(...pending.map((task, index) => renderTask(task, index + 1, pending.length)));
  doneList.replaceChildren(...done.map(task => renderTask(task, "")));
  empty.hidden = pending.length > 0;
  empty.textContent = done.length ? "모든 할 일을 완료했어요!" : "아직 할 일이 없어요.";
  doneSection.hidden = done.length === 0;
  count.textContent = `${done.length} / ${tasks.length} 완료`;
  progress.max = tasks.length || 1;
  progress.value = done.length;
}

function showError(text) {
  error.textContent = text;
  error.hidden = !text;
}

function restoreFocus(id, selector) {
  const row = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const control = row?.querySelector(selector);
  const fallback = row?.querySelector(selector === ".up" ? ".down" : ".up");
  const target = [control, fallback, row?.querySelector(".check")]
    .find(element => element && !element.disabled && !element.hidden);
  target?.focus({ preventScroll: true });
}

function deleteTask(index, row) {
  const next = tasks.slice();
  next.splice(index, 1);
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;

  void save(next, () => {
    if (neighbor) restoreFocus(neighbor.dataset.id, ".delete");
    else input.focus({ preventScroll: true });
    if (!next.length) showReaction([[null, "오늘도 함께 해보자!"]]);
  });
}

async function save(next, afterSave) {
  if (saving) return;
  saving = true;
  addButton.disabled = true;
  showError("");

  try {
    await chrome.storage.local.set({ [storageKey]: next });
  } catch {
    showError("저장하지 못했어요. 다시 시도해 주세요.");
    return;
  } finally {
    saving = false;
    addButton.disabled = false;
  }

  tasks = next;
  render();
  afterSave();
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    input.focus();
    return;
  }

  const draft = input.value;
  const task = { id: crypto.randomUUID(), title, done: false, important: false };
  void save([...tasks, task], () => {
    if (input.value === draft) input.value = "";
    input.focus({ preventScroll: true });
    react("add");
  });
});

function updateTask(event) {
  const control = event.target.closest("button, .check");
  const row = control?.closest(".task");
  if (!row) return;

  const index = tasks.findIndex(task => task.id === row.dataset.id);
  const task = tasks[index];
  if (!task) return;
  if (control.matches(".delete")) {
    deleteTask(index, row);
    return;
  }
  const next = tasks.slice();
  let reaction;
  let selector;

  if (control.matches(".check")) {
    control.checked = task.done;
    const done = !task.done;
    next[index] = { ...task, done };
    if (done) reaction = next.every(item => item.done) ? "allDone" : "complete";
    selector = ".check";
  } else if (control.matches(".star")) {
    next[index] = { ...task, important: !task.important };
    if (!task.important) reaction = "important";
    selector = ".star";
  } else {
    const up = control.matches(".up");
    const neighbor = up
      ? tasks.findLastIndex((item, position) => position < index && !item.done)
      : tasks.findIndex((item, position) => position > index && !item.done);
    if (neighbor < 0) return;
    [next[index], next[neighbor]] = [next[neighbor], next[index]];
    selector = up ? ".up" : ".down";
  }

  void save(next, () => {
    restoreFocus(task.id, selector);
    if (reaction) react(reaction);
    else if (selector === ".check" && stage.classList.contains("is-celebrating")) {
      showReaction([[null, "오늘도 함께 해보자!"]]);
    }
  });
}

for (const list of [pendingList, doneList]) {
  list.addEventListener("change", updateTask);
  list.addEventListener("click", event => {
    if (event.target.closest("button")) updateTask(event);
  });
}

async function initialize() {
  try {
    const saved = await chrome.storage.local.get(storageKey);
    tasks = saved[storageKey] ?? [];
    render();
    input.disabled = addButton.disabled = false;
  } catch {
    showError("목록을 불러오지 못했어요. 확장 프로그램을 다시 열어 주세요.");
  }
}

void initialize();
