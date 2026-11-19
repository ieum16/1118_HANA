const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'todayTasks';
let tasks = [];
let busy = true;
let captionTimer;
let currentCaption = '';

function normalize(text) {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function characterCount(text) {
  return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].length;
}

function visibleTasks() {
  return [...tasks].sort((a, b) => a.createdAt - b.createdAt);
}

function updateCaption(hasRemaining) {
  const caption = $('#image-caption');
  caption.hidden = busy;
  if (busy) return;
  const text = hasRemaining ? '여기서 내보내줘!!!!' : '투루리라~';
  if (text === currentCaption) return;
  currentCaption = text;
  clearInterval(captionTimer);
  caption.setAttribute('aria-label', text);
  const characters = [...text];
  let length = 1;
  const output = $('#caption-text');
  output.textContent = characters[0];
  captionTimer = setInterval(() => {
    length += 1;
    output.textContent = characters.slice(0, length).join('');
    if (length >= characters.length) clearInterval(captionTimer);
  }, hasRemaining ? 100 : 200);
}

function updateStatusImage() {
  const image = $('#status-image');
  image.hidden = busy;
  const hasRemaining = tasks.some(task => !task.completed);
  updateCaption(hasRemaining);
  image.src = hasRemaining ? '할일.jpg' : '해방.webp';
  image.alt = hasRemaining ? '위대이 남아 있어요' : '모든 위대에서 해방!';
}

function render() {
  updateStatusImage();
  $('#today').textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  $('#remaining').textContent = `남은 위대 ${tasks.filter(task => !task.completed).length}개 · 전체 ${tasks.length}개`;
  const list = $('#tasks');
  list.replaceChildren();
  for (const task of visibleTasks()) {
    const row = $('#task-template').content.firstElementChild.cloneNode(true);
    row.dataset.id = task.id;
    row.classList.toggle('completed', task.completed);
    row.querySelector('.task-text').textContent = task.text;
    const finish = row.querySelector('.finish');
    finish.textContent = task.completed ? '취소' : '완료';
    finish.setAttribute('aria-label', `${task.text} ${task.completed ? '완료 취소' : '완료'}`);
    row.querySelector('.remove').setAttribute('aria-label', `${task.text} 삭제`);
    list.append(row);
  }
  $('#empty').hidden = list.children.length > 0;
  $('#empty').textContent = '내가 위대하단 걸 아냔 말이야!!!';
  document.querySelectorAll('button, input, textarea, select').forEach(control => { control.disabled = busy; });
}

async function save(nextTasks, message) {
  if (busy) return false;
  busy = true;
  render();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: nextTasks });
    tasks = nextTasks;
    $('#message').textContent = message;
    return true;
  } catch (error) {
    $('#message').textContent = '저장하지 못했습니다. 다시 시도해 주세요.';
    return false;
  } finally {
    busy = false;
    render();
  }
}

$('#task-text').addEventListener('input', () => {
  const count = characterCount($('#task-text').value);
  $('#task-text').setAttribute('aria-invalid', String(count > 50));
  $('#message').textContent = count > 50 ? '위대은 50자까지 입력할 수 있습니다.' : '';
});

$('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const rawText = $('#task-text').value;
  const text = normalize(rawText);
  let error = '';
  if (!text) error = '할 일을 작성하라고!';
  else if (characterCount(rawText) > 50) error = '위대은 50자까지 입력할 수 있습니다.';
  else if (tasks.some(task => normalize(task.text).toLocaleLowerCase('ko') === text.toLocaleLowerCase('ko'))) error = '이미 등록한 위대입니다.';
  if (error) {
    $('#message').textContent = error;
    $('#task-text').focus();
    return;
  }
  const task = { id: crypto.randomUUID(), text, completed: false, createdAt: Date.now() };
  if (await save([...tasks, task], '')) {
    $('#add-form').reset();
    $('#task-text').focus();
  }
});

$('#tasks').addEventListener('click', event => {
  const row = event.target.closest('.task');
  if (!row || busy) return;
  if (event.target.closest('.finish')) {
    save(tasks.map(task => task.id === row.dataset.id ? { ...task, completed: !task.completed } : task), '');
  } else if (event.target.closest('.remove')) {
    save(tasks.filter(task => task.id !== row.dataset.id), '');
  }
});
async function initialize() {
  render();
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    tasks = stored[STORAGE_KEY] || [];
    busy = false;
    render();
  } catch (error) {
    $('#message').textContent = '위대을 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.';
  }
}
initialize();
setInterval(() => { if (!busy) render(); }, 60000);
