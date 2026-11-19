const NAME = "춘봉";           // 말하는 캐릭터 이름 (바꾸고 싶으면 여기만 고치면 돼요)
const KEY = "sheriff-todo-v1";

const $ = id => document.getElementById(id);

// 툴바 아이콘으로 열면 작은 팝업, "크게 보기"로 열면 새 탭 전체 화면
const isPopup = !new URLSearchParams(location.search).has("full");
if (isPopup) document.documentElement.classList.add("popup");
function openFullTab() {
  const url = "todo.html?full=1";
  if (window.chrome?.tabs) { chrome.tabs.create({ url }); window.close(); }
  else window.open(url, "_blank");
}
$("openFull").onclick = openFullTab;
const bubble = $("bubble"), list = $("list"), input = $("input");
const mascot = $("mascot");
const mascotFrame = $("mascotFrame");
const POSE = { talk: "img/chunbong-play.jpg", cheer: "img/chunbong-cheer.jpg" };
Object.values(POSE).forEach(src => { new Image().src = src; });

let todos = load();
let typingTimer = null, nextTimer = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(todos)); } catch {}
}

// 받침 있으면 "이야", 없으면 "야"
function iya(word) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "(이)야";
  return code % 28 ? "이야" : "야";
}
function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 말풍선에 한 글자씩 타이핑
function say(html, { shout = false } = {}) {
  clearInterval(typingTimer);
  bubble.classList.toggle("shout", shout);
  if (shout) { bubble.style.animation = "none"; bubble.offsetHeight; bubble.style.animation = ""; }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const full = tmp.textContent;
  const out = $("bubbleText");
  let i = 0;
  out.textContent = "";
  typingTimer = setInterval(() => {
    i++;
    out.textContent = full.slice(0, i);
    if (i >= full.length) { clearInterval(typingTimer); out.innerHTML = html; }
  }, 35);
  animate(shout ? "cheer" : "talk");
}
function animate(cls) {
  mascot.src = POSE[cls];
  mascotFrame.classList.toggle("closeup", cls === "cheer");
  mascotFrame.classList.remove("talk", "cheer");
  mascotFrame.offsetWidth;
  mascotFrame.classList.add(cls);
}
function popSfx() {
  const word = pick(["팡!", "짠!", "최고!", "와우!"]);
  $("sfx").textContent = word;
  ["sfx", "sfx2"].forEach(id => {
    const el = $(id);
    el.classList.remove("pop"); el.offsetWidth; el.classList.add("pop");
  });
}

// 받침 있으면 "이", 없으면 "가"
function iga(word) {
  const code = word.slice(-1).charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? "이" : "가";
}

function sayToday(text) {
  say(`${NAME}${iga(NAME)} 오늘 할 일은 <b>${esc(text)}</b>${iya(text)}!`);
}
function sayNextOrDone() {
  const left = todos.filter(t => !t.done);
  if (todos.length === 0) say(`하울디, 파트너! 오늘 할 일을 알려줘!`);
  else if (left.length === 0) say(`오늘 할 일 전부 끝! 넌 최고의 파트너야! 🤠`, { shout: true });
  else say(`다음 할 일은 <b>${esc(left[0].text)}</b>${iya(left[0].text)}! 남은 건 ${left.length}개!`);
}

function render() {
  list.innerHTML = "";
  todos.forEach(t => {
    const li = document.createElement("li");
    if (t.done) li.className = "done";
    li.innerHTML = `
      <div class="mini">${miniFace()}</div>
      <div class="item-bubble" title="눌러서 말하게 하기">${esc(t.text)}${t.done ? '<span class="stamp">참 잘했어요</span>' : ""}</div>
      ${t.done
        ? `<button class="btn btn-undo" type="button" data-act="undo">되돌리기</button>`
        : `<button class="btn btn-ok" type="button" data-act="ok">확인</button>`}
      <button class="del" type="button" data-act="del" aria-label="삭제">✕</button>`;
    li.querySelector(".item-bubble").onclick = () => t.done
      ? say(`<b>${esc(t.text)}</b>, 그건 이미 끝냈지! 잘했어!`)
      : sayToday(t.text);
    li.querySelectorAll("button").forEach(b => b.onclick = () => act(t, b.dataset.act));
    list.appendChild(li);
  });
  const done = todos.filter(t => t.done).length;
  $("count").textContent = `${done} / ${todos.length}`;
  $("empty").style.display = todos.length ? "none" : "block";
}

function act(t, what) {
  clearTimeout(nextTimer);
  if (what === "ok") {
    t.done = true;
    popSfx();
    say(pick([
      `잘했어! <b>${esc(t.text)}</b> 끝!`,
      `잘했어, 파트너! <b>${esc(t.text)}</b> 해냈구나!`,
      `잘했어! 역시 내 파트너야!`,
    ]), { shout: true });
    nextTimer = setTimeout(sayNextOrDone, 2600);
  } else if (what === "undo") {
    t.done = false;
    sayToday(t.text);
  } else if (what === "del") {
    todos = todos.filter(x => x !== t);
    sayNextOrDone();
  }
  save(); render();
}

$("form").onsubmit = e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { say("뭘 해야 하는지 적어줘야지, 파트너!"); return; }
  todos.push({ id: Date.now(), text, done: false });
  input.value = "";
  save(); render();
  clearTimeout(nextTimer);
  sayToday(text);
};

function miniFace() {
  return `<img src="img/chunbong-face.png" alt="">`;
}

// 시작
render();
const firstLeft = todos.find(t => !t.done);
if (firstLeft) sayToday(firstLeft.text); else sayNextOrDone();
