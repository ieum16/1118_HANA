const form = document.querySelector('#task-form');
const input = document.querySelector('#task-input');
const addButton = document.querySelector('#add-task');
const fontSize = document.querySelector('#font-size');
const status = document.querySelector('#status');
const emptyState = document.querySelector('#empty-state');
const list = document.querySelector('#task-list');
const characterLimit = 50;
const lengthMessage = `할 일은 ${characterLimit}자까지 입력할 수 있어요.`;
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const people = ['담당 A', '담당 B', '담당 C'];

let tasks = [];
let saving = false;

function showMessage(message, invalid = false) {
  status.textContent = message;
  input.setAttribute('aria-invalid', String(invalid));
}

function exceedsLimit(title) {
  let count = 0;
  for (const character of segmenter.segment(title)) {
    count += 1;
    if (count > characterLimit) return true;
  }
  return false;
}

function comparisonKey(title) {
  return title.normalize('NFC').replace(/\s+/gu, ' ').toLowerCase();
}

function createPeopleChecks(task, taskIndex) {
  const group = document.createElement('fieldset');
  group.className = 'task-people';

  const legend = document.createElement('legend');
  legend.textContent = '처리한 사람';
  group.append(legend);

  const checkedBy = task.checkedBy ?? [];
  for (const [personIndex, person] of people.entries()) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checkedBy.includes(person);

    checkbox.addEventListener('change', async () => {
      const nextCheckedBy = checkbox.checked
        ? [...checkedBy, person]
        : checkedBy.filter((name) => name !== person);
      const nextTasks = tasks.map((entry, index) => (
        index === taskIndex ? { ...entry, checkedBy: nextCheckedBy } : entry
      ));

      if (await saveTasks(nextTasks)) {
        list.children[taskIndex].querySelectorAll('input')[personIndex].focus();
      } else {
        checkbox.checked = checkedBy.includes(person);
      }
    });

    label.append(checkbox, person);
    group.append(label);
  }

  return group;
}

function renderTasks() {
  emptyState.hidden = tasks.length > 0;
  list.replaceChildren();

  for (const [index, task] of tasks.entries()) {
    const row = document.createElement('li');
    row.classList.toggle('completed', task.completed);

    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = task.completed ? '되돌리기' : '완료';
    toggle.setAttribute('aria-label', `${toggle.textContent}: ${task.title}`);
    toggle.addEventListener('click', async () => {
      const nextTasks = tasks.map((entry, position) => (
        position === index ? { ...entry, completed: !entry.completed } : entry
      ));
      if (await saveTasks(nextTasks)) list.children[index].querySelector('button').focus();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.setAttribute('aria-label', `삭제: ${task.title}`);
    remove.addEventListener('click', async () => {
      const nextTasks = tasks.filter((_, position) => position !== index);
      if (await saveTasks(nextTasks)) input.focus();
    });

    row.append(title, toggle, remove, createPeopleChecks(task, index));
    list.append(row);
  }
}

async function saveTasks(nextTasks) {
  if (saving) return false;

  saving = true;
  addButton.disabled = true;
  try {
    await chrome.storage.local.set({ tasks: nextTasks });
    tasks = nextTasks;
    renderTasks();
    updateDraftMessage();
    return true;
  } catch {
    showMessage('저장하지 못했어요. 다시 시도해 주세요.');
    return false;
  } finally {
    saving = false;
    addButton.disabled = false;
  }
}

function updateDraftMessage() {
  const tooLong = exceedsLimit(input.value.trim());
  showMessage(tooLong ? lengthMessage : '', tooLong);
}

input.addEventListener('input', updateDraftMessage);

fontSize.addEventListener('change', async () => {
  const size = fontSize.value;
  document.documentElement.dataset.fontSize = size;
  try {
    await chrome.storage.local.set({ fontSize: size });
  } catch {
    showMessage('글씨 크기 설정을 저장하지 못했어요.');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (input.disabled || saving) return;

  const draft = input.value;
  const title = draft.trim();
  let message = '';
  if (!title) {
    message = '할 일을 입력해 주세요.';
  } else if (exceedsLimit(title)) {
    message = lengthMessage;
  } else if (tasks.some((task) => comparisonKey(task.title) === comparisonKey(title))) {
    message = '이미 목록에 있는 할 일이에요.';
  }

  if (message) {
    showMessage(message, true);
    input.focus();
    return;
  }

  if (await saveTasks([...tasks, { title, completed: false, checkedBy: [] }])) {
    if (input.value === draft) input.value = '';
    updateDraftMessage();
    input.focus();
  }
});

async function loadTasks() {
  try {
    const saved = await chrome.storage.local.get({ tasks: [], fontSize: 'normal' });
    tasks = saved.tasks;
    fontSize.value = ['small', 'normal', 'large'].includes(saved.fontSize) ? saved.fontSize : 'normal';
    document.documentElement.dataset.fontSize = fontSize.value;
    renderTasks();
    input.disabled = false;
    addButton.disabled = false;
    fontSize.disabled = false;
  } catch {
    showMessage('목록을 불러오지 못했어요. 팝업을 다시 열어 주세요.');
  }
}

loadTasks();
