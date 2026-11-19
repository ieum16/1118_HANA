const C = TodoCore;
const $ = id => document.getElementById(id);
let state = { days: {}, reminders: false }, today = C.dayKey(), ready = false;
let saveQueue = Promise.resolve();
let moodTimer = null;
let additionScrollTimer = null;
const cryingCats = ['img/cat-crying.png', 'img/cat-crying-surprised.png'];
const day = () => state.days[today] ||= C.emptyDay();
if (new URLSearchParams(location.search).has('full')) document.documentElement.classList.add('full');

function save() {
  const snapshot = JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue.catch(() => {}).then(() => chrome.storage.local.set({ [C.KEY]: snapshot }));
  saveQueue.then(() => { $('storageStatus').textContent = '이 브라우저에 자동 저장돼요.'; }, () => {
    $('storageStatus').textContent = '저장하지 못했어요. 창을 닫기 전에 다시 시도해 주세요.';
  });
  return saveQueue;
}
function speak(text, mood = 'neutral') {
  clearTimeout(moodTimer);
  clearTimeout(additionScrollTimer);
  CatAnimation.stop();
  CatSound.play(mood, state.soundEnabled !== false);
  const animated = mood === 'happy' || mood === 'huh';
  $('happyCat').hidden = !animated;
  $('cat').hidden = animated;
  $('happyCat').setAttribute('aria-label', mood === 'huh' ? '당황해서 고개를 움직이는 Huh 고양이' : '기쁘게 뛰는 해피캣');
  $('message').textContent = text;
  $('moodLabel').textContent = mood === 'happy' ? '완료했어요' : mood === 'huh' ? '할 일이 쌓이고 있어요' : mood === 'crying' || mood === 'gag' ? '할 일 추가됨' : '오늘의 일정';
  $('cat').src = mood === 'gag' ? 'img/cat-gag.png' : mood === 'crying' ? cryingCats[Math.floor(Math.random() * cryingCats.length)] : 'img/cat-neutral.png';
  $('cat').alt = mood === 'gag' ? '우웩 표정을 짓는 고양이' : mood === 'crying' ? '눈물을 흘리는 고양이 밈' : '오늘 할 일을 함께하는 기본 고양이';
  const stage = document.querySelector('.cat-stage');
  stage.className = `cat-stage ${mood}`;
  if (mood !== 'neutral') {
    const bounds = stage.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      stage.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start'
      });
    }
  }
  if (animated) {
    CatAnimation.start(mood);
    moodTimer = setTimeout(showNeutral, mood === 'huh' ? 3500 : 6500);
  } else if (mood === 'crying' || mood === 'gag') moodTimer = setTimeout(showNeutral, 4500);
}
function showNeutral() {
  const left = day().tasks.filter(t => !t.done).length;
  speak(left ? `남은 할 일은 ${left}개예요.` : day().tasks.length ? '오늘 할 일을 모두 마쳤어요.' : '오늘 할 일을 적어보세요.');
}
$('happyVideo').addEventListener('ended', showNeutral);
$('happyCat').addEventListener('animationerror', () => {
  if ($('happyCat').hidden) return;
  $('happyCat').hidden = true; $('cat').hidden = false;
  const huh = document.querySelector('.cat-stage').classList.contains('huh');
  $('cat').src = huh ? 'img/cat-neutral.png' : 'img/cat-happy.png';
  $('cat').alt = huh ? '기본 고양이' : '완료를 축하하는 해피캣';
  document.querySelector('.cat-stage').classList.add('animation-fallback');
  moodTimer = setTimeout(showNeutral, 4500);
});
function timeLabel(timestamp) {
  const d = new Date(timestamp);
  const prefix = C.dayKey(d) === today ? '' : `${d.getMonth() + 1}/${d.getDate()} `;
  return prefix + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function makeButton(text, label, action, className = 'text-button') {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text; button.className = className;
  button.setAttribute('aria-label', label); button.title = label;
  button.addEventListener('click', action);
  return button;
}
function render() {
  const current = day(), planned = C.schedule(current, today), completed = current.tasks.filter(t => t.done);
  const soundEnabled = state.soundEnabled !== false;
  $('soundToggle').textContent = soundEnabled ? '🔊' : '🔇';
  $('soundToggle').setAttribute('aria-pressed', String(soundEnabled));
  $('soundToggle').setAttribute('aria-label', soundEnabled ? '효과음 끄기' : '효과음 켜기');
  $('soundToggle').title = soundEnabled ? '효과음 끄기' : '효과음 켜기';
  $('dateLabel').textContent = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  $('startTime').value = current.start;
  $('reminders').checked = state.reminders;
  $('progressText').textContent = `${completed.length} / ${current.tasks.length} 완료`;
  $('progress').max = current.tasks.length || 1; $('progress').value = completed.length;
  $('remaining').textContent = `${planned.reduce((sum, t) => sum + t.minutes, 0)}분 남음`;
  $('doneCount').textContent = completed.length;
  $('empty').hidden = planned.length > 0;
  if (!planned.length && completed.length) $('empty').querySelector('p').textContent = '오늘 할 일을 모두 마쳤어요.';
  else $('empty').querySelector('p').textContent = '아직 비어 있는 하루. 첫 번째 할 일을 적어보세요.';
  $('list').replaceChildren(); $('doneList').replaceChildren();
  planned.forEach((task, index) => {
    const li = document.createElement('li'); li.className = 'task';
    li.append(makeButton('✓', `${task.text} 완료하고 목록에서 지우기`, () => {
      const original = current.tasks.find(t => t.id === task.id); original.done = true;
      original.completedAt = Date.now(); current.start = C.roundTime();
      save(); render(); speak(`“${task.text}” 완료했어요.`, 'happy');
    }, 'complete-button'));
    const content = document.createElement('div'), title = document.createElement('p'), time = document.createElement('div');
    title.className = 'task-title'; title.textContent = task.text;
    time.className = 'task-time'; time.textContent = `${timeLabel(task.start)} – ${timeLabel(task.end)} · ${task.minutes}분`;
    content.append(title, time); li.append(content);
    const controls = document.createElement('div'); controls.className = 'order-controls';
    [-1, 1].forEach(direction => {
      const button = makeButton(direction < 0 ? '↑' : '↓', direction < 0 ? '먼저 하기' : '나중에 하기', () => {
        const neighbor = planned[index + direction];
        const a = current.tasks.findIndex(t => t.id === task.id), b = current.tasks.findIndex(t => t.id === neighbor.id);
        [current.tasks[a], current.tasks[b]] = [current.tasks[b], current.tasks[a]];
        save(); render();
      });
      button.disabled = index + direction < 0 || index + direction >= planned.length;
      controls.append(button);
    });
    li.append(controls); $('list').append(li);
  });
  completed.forEach(task => {
    const li = document.createElement('li'); li.className = 'done-task';
    const title = document.createElement('span'); title.textContent = task.text;
    li.append(title, makeButton('되돌리기', `${task.text} 되돌리기`, () => {
      task.done = false; current.start = C.roundTime(); save(); render(); speak('진행할 할 일로 되돌렸어요.');
    }), makeButton('×', `${task.text} 기록 삭제`, () => {
      current.tasks = current.tasks.filter(t => t.id !== task.id); save(); render(); speak('완료 기록을 삭제했어요.');
    }));
    $('doneList').append(li);
  });
  const overflow = planned.some(t => C.dayKey(new Date(t.end)) !== today);
  $('overflow').hidden = !overflow;
  $('overflow').textContent = '일부 일정이 자정을 넘어요. 시간표의 날짜를 확인해 주세요.';
  $('carry').hidden = !Object.entries(state.days).some(([date, value]) => date < today && value.tasks.some(t => !t.done));
}
function checkDay() {
  const next = C.dayKey();
  if (today !== next) { today = next; day(); save(); render(); speak('날짜가 바뀌었어요. 오늘 할 일을 추가해 보세요.'); }
}
$('form').addEventListener('submit', event => {
  event.preventDefault(); if (!ready) return; checkDay();
  const text = $('taskInput').value.trim();
  if (!text) { $('taskInput').setCustomValidity('할 일을 한 글자 이상 적어주세요.'); $('taskInput').reportValidity(); return; }
  const current = day();
  C.addTask(current, { id: crypto.randomUUID(), text, minutes: Number($('duration').value), done: false });
  const remainingCount = current.tasks.filter(task => !task.done).length;
  const mood = C.shouldShowHuh(current) ? 'huh' : Math.random() >= 2 / 3 ? 'gag' : 'crying';
  $('taskInput').value = ''; save(); render();
  speak(mood === 'huh' ? `남은 할 일이 ${remainingCount}개예요.` : '할 일을 추가했어요. 시간표를 확인해 보세요.', mood);
  $('taskInput').focus({ preventScroll: true });
  const revealSchedule = () => {
    const schedule = document.querySelector('.schedule-section');
    const target = schedule.getBoundingClientRect().height <= window.innerHeight - 24
      ? schedule : $('list').lastElementChild;
    target?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: target === schedule ? 'start' : 'center'
    });
  };
  additionScrollTimer = setTimeout(revealSchedule, 2500);
});
$('taskInput').addEventListener('input', () => $('taskInput').setCustomValidity(''));
$('startTime').addEventListener('change', () => { if (ready && $('startTime').value) { day().start = $('startTime').value; save(); render(); } });
$('reschedule').addEventListener('click', () => { if (!ready) return; checkDay(); day().start = C.roundTime(); save(); render(); speak('현재 시각부터 일정을 다시 배치했어요.'); });
$('reminders').addEventListener('change', () => { if (!ready) return; state.reminders = $('reminders').checked; save(); });
$('soundToggle').addEventListener('click', () => {
  if (!ready) return;
  state.soundEnabled = state.soundEnabled === false;
  CatSound.stop();
  if (state.soundEnabled) {
    const stage = document.querySelector('.cat-stage');
    const mood = ['happy', 'crying', 'gag', 'huh'].find(value => stage.classList.contains(value));
    if (mood) CatSound.play(mood, true);
  }
  save(); render();
});
$('carry').addEventListener('click', () => {
  if (!ready) return;
  checkDay();
  for (const date of Object.keys(state.days).sort()) {
    if (date >= today) continue;
    const old = state.days[date]; day().tasks.push(...old.tasks.filter(t => !t.done)); old.tasks = old.tasks.filter(t => t.done);
  }
  day().start = C.roundTime(); save(); render(); speak('이전 할 일을 오늘 일정으로 가져왔어요.');
});
$('openFull').addEventListener('click', async () => {
  try { await saveQueue; await chrome.tabs.create({ url: chrome.runtime.getURL('todo.html?full=1') }); window.close(); }
  catch { $('storageStatus').textContent = '새 탭을 열지 못했어요. 다시 시도해 주세요.'; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[C.KEY] || !ready) return;
  state = changes[C.KEY].newValue || { days: {}, reminders: false }; render();
  if (state.soundEnabled === false) CatSound.stop();
});
(async () => {
  try {
    const data = await chrome.storage.local.get(C.KEY);
    state = data[C.KEY] || state; day(); ready = true; render();
    showNeutral();
    setInterval(checkDay, 15000);
    window.addEventListener('focus', checkDay);
  } catch { $('storageStatus').textContent = '저장소를 열지 못했어요. 확장 프로그램을 다시 열어주세요.'; }
})();
