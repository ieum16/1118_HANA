const form = document.querySelector('#todo-form');
const input = document.querySelector('#todo-input');
const addButton = document.querySelector('#add-button');
const dateInput = document.querySelector('#task-date');
const list = document.querySelector('#todo-list');
const remaining = document.querySelector('#remaining');
const empty = document.querySelector('#empty');
const message = document.querySelector('#message');
const calendarDays = document.querySelector('#calendar-days');
const monthLabel = document.querySelector('#calendar-month');
let tasks = [];
let busy = true;

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

let selectedDate = dateKey(new Date());
let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
dateInput.value = selectedDate;

function normalize(text) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function renderCalendar() {
  monthLabel.textContent = displayedMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  calendarDays.replaceChildren();
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const offset = displayedMonth.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  for (let index = 0; index < offset; index++) {
    calendarDays.append(document.createElement('span'));
  }
  for (let day = 1; day <= days; day++) {
    const key = dateKey(new Date(year, month, day));
    const dayTasks = tasks.filter(task => task.date === key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.textContent = day;
    button.classList.toggle('selected', key === selectedDate);
    button.classList.toggle('today', key === dateKey(new Date()));
    button.classList.toggle('has-tasks', dayTasks.length > 0);
    button.setAttribute('aria-pressed', String(key === selectedDate));
    button.setAttribute('aria-label', `${year}년 ${month + 1}월 ${day}일, 할 일 ${dayTasks.length}개`);
    button.addEventListener('click', () => selectDate(key));
    calendarDays.append(button);
  }
}

function selectDate(key) {
  selectedDate = key;
  dateInput.value = key;
  const [year, month] = key.split('-').map(Number);
  displayedMonth = new Date(year, month - 1, 1);
  render();
}

function render() {
  renderCalendar();
  list.replaceChildren();
  const visibleTasks = tasks.filter(task => task.date === selectedDate);
  const count = visibleTasks.filter(task => !task.done).length;
  const total = tasks.filter(task => !task.done).length;
  remaining.textContent = `선택한 날 ${count}개 · 전체 남은 할 일 ${total}개`;
  empty.hidden = visibleTasks.length > 0;
  for (const task of visibleTasks) {
    const row = document.createElement('li');
    const label = document.createElement('label');
    label.className = task.done ? 'task-label completed' : 'task-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.disabled = busy;
    checkbox.addEventListener('change', () => {
      save(tasks.map(item => item.id === task.id ? { ...item, done: checkbox.checked } : item));
    });
    const text = document.createElement('span');
    text.textContent = task.text;
    label.append(checkbox, text);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.textContent = '삭제';
    remove.setAttribute('aria-label', `${task.text} 삭제`);
    remove.disabled = busy;
    remove.addEventListener('click', () => save(tasks.filter(item => item.id !== task.id)));
    row.append(label, remove);
    list.append(row);
  }
}

async function save(nextTasks, clearInput = false) {
  if (busy) return;
  busy = true;
  input.disabled = true;
  addButton.disabled = true;
  render();
  message.textContent = '';
  try {
    await chrome.storage.local.set({ tasks: nextTasks });
    tasks = nextTasks;
    if (clearInput) input.value = '';
  } catch {
    message.textContent = '저장하지 못했어요. 다시 시도해 주세요.';
  } finally {
    busy = false;
    input.disabled = false;
    addButton.disabled = false;
    render();
    if (clearInput) input.focus();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || event.isComposing) return;
  const text = normalize(input.value);
  if (!text) {
    message.textContent = '할 일을 입력해 주세요.';
  } else if (Array.from(input.value.trim().normalize('NFC')).length > 50) {
    message.textContent = '할 일은 50자 이내로 입력해 주세요.';
  } else if (!dateInput.value || !dateInput.validity.valid) {
    message.textContent = '올바른 날짜를 선택해 주세요.';
    dateInput.focus();
    return;
  } else if (tasks.some(task => normalize(task.text).toLocaleLowerCase('ko') === text.toLocaleLowerCase('ko'))) {
    message.textContent = '이미 있는 할 일이에요.';
  } else {
    save([...tasks, { id: crypto.randomUUID(), text, done: false, date: selectedDate }], true);
    return;
  }
  input.focus();
});

input.addEventListener('input', () => {
  message.textContent = Array.from(input.value.trim().normalize('NFC')).length > 50
    ? '할 일은 50자 이내로 입력해 주세요.' : '';
});

dateInput.addEventListener('change', () => {
  if (dateInput.value && dateInput.validity.valid) selectDate(dateInput.value);
});

document.querySelector('#previous-month').addEventListener('click', () => {
  displayedMonth.setMonth(displayedMonth.getMonth() - 1);
  renderCalendar();
});
document.querySelector('#next-month').addEventListener('click', () => {
  displayedMonth.setMonth(displayedMonth.getMonth() + 1);
  renderCalendar();
});
document.querySelector('#today').addEventListener('click', () => selectDate(dateKey(new Date())));

async function initialize() {
  try {
    const stored = await chrome.storage.local.get({ tasks: [] });
    tasks = stored.tasks.map(task => ({ ...task, date: task.date || selectedDate }));
    busy = false;
    input.disabled = false;
    addButton.disabled = false;
    render();
    input.focus();
  } catch {
    remaining.textContent = '목록을 불러오지 못했어요';
    message.textContent = '창을 닫고 다시 열어 주세요.';
  }
}

initialize();
