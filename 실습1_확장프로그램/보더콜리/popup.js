const element = (id) => document.getElementById(id);
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
let tasks = [];
let busy = false;
let selectedDate = localDate();
const priorities = { 1: '높음', 2: '보통', 3: '낮음' };
const titleKey = (title) => title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');

function announce(message) {
  element('status').textContent = message;
}

async function save(nextTasks) {
  if (busy) return false;
  busy = true;
  document.querySelectorAll('main > :not(#exchange) :is(button, input, select)').forEach((control) => { control.disabled = true; });
  try {
    await chrome.storage.local.set({ tasks: nextTasks });
    tasks = nextTasks;
    announce('저장했습니다.');
    return true;
  } catch (error) {
    announce('저장하지 못했습니다. 다시 시도해 주세요.');
    return false;
  } finally {
    busy = false;
    document.querySelectorAll('main > :not(#exchange) :is(button, input, select)').forEach((control) => { control.disabled = false; });
    render();
  }
}

function isDone(task, date) {
  return task.completedDates.includes(date);
}

function taskCard(task, date, duplicateLabel = '') {
  const done = isDone(task, date);
  const card = document.createElement('li');
  card.className = `task${task.important ? ' important' : ''}${done ? ' done' : ''}`;
  const heading = document.createElement('label');
  heading.className = 'task-heading';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = done;
  check.setAttribute('aria-label', `${task.title} 완료`);
  check.addEventListener('change', () => {
    const completedDates = done ? task.completedDates.filter((day) => day !== date) : [...task.completedDates, date];
    save(tasks.map((item) => item.id === task.id ? { ...item, completedDates } : item));
  });
  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;
  const icon = document.createElement('span');
  icon.className = 'goblin-icon';
  icon.setAttribute('aria-hidden', 'true');
  for (const part of ['goblin-face', 'goblin-eyes', 'goblin-grin']) {
    const shape = document.createElement('span');
    shape.className = part;
    icon.append(shape);
  }
  heading.append(check, icon, title);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const now = new Date();
  const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = localDate();
  const overdue = task.deadline && !done && (date < today || (date === today && task.deadline < timeNow));
  for (const text of [done && '할일 처치 완료', duplicateLabel, task.category, `우선순위 ${priorities[task.priority]}`, task.deadline && `마감 ${task.deadline}${overdue ? ' · 지남' : ''}`].filter(Boolean)) {
    const badge = document.createElement('span');
    badge.textContent = text;
    if (overdue && text.startsWith('마감')) badge.className = 'overdue';
    meta.append(badge);
  }
  const actions = document.createElement('div');
  actions.className = 'actions';
  const important = document.createElement('button');
  important.type = 'button';
  important.textContent = task.important ? '★ 중요' : '☆ 중요 표시';
  important.setAttribute('aria-pressed', String(task.important));
  important.setAttribute('aria-label', `${task.title} 중요 표시`);
  important.addEventListener('click', () => save(tasks.map((item) => item.id === task.id ? { ...item, important: !item.important } : item)));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete';
  remove.textContent = '삭제';
  remove.setAttribute('aria-label', `${task.title} 삭제`);
  remove.addEventListener('click', () => save(tasks.filter((item) => item.id !== task.id)));
  actions.append(important, remove);
  card.append(heading, meta, actions);
  return card;
}

function render() {
  const date = selectedDate;
  element('view-date').value = date;
  element('date').textContent = new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const visibleTasks = tasks.filter((task) => task.type === 'daily' ? task.date <= date : task.date === date);
  const completed = visibleTasks.filter((task) => isDone(task, date)).length;
  element('progress').textContent = `${visibleTasks.length}개 중 ${completed}개 완료`;
  element('clear-all').disabled = busy || tasks.length === 0;
  const selectedCategory = element('filter').value;
  element('filter').replaceChildren(new Option('전체 분류', ''));
  [...new Set(visibleTasks.map((task) => task.category))].sort().forEach((category) => element('filter').add(new Option(category, category)));
  element('filter').value = selectedCategory;
  const filter = element('filter').value;
  for (const type of ['daily', 'today']) {
    const list = element(`${type}-list`);
    list.replaceChildren();
    const items = visibleTasks.filter((task) => task.type === type && (!filter || task.category === filter));
    items.sort((a, b) => Number(isDone(a, date)) - Number(isDone(b, date)) || Number(b.important) - Number(a.important) || a.priority - b.priority || (a.deadline || '99:99').localeCompare(b.deadline || '99:99'));
    element(`${type}-count`).textContent = String(items.length);
    const groups = new Map();
    for (const task of items) {
      const key = titleKey(task.title);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    for (const group of groups.values()) {
      if (group.length === 1) {
        list.append(taskCard(group[0], date));
        continue;
      }
      const wrapper = document.createElement('li');
      wrapper.className = 'task-group';
      const heading = document.createElement('h3');
      heading.textContent = `${group[0].title} · 같은 업무 ${group.length}개`;
      const children = document.createElement('ul');
      group.forEach((task, index) => children.append(taskCard(task, date, `같은 업무 ${index + 1}/${group.length}`)));
      wrapper.append(heading, children);
      list.append(wrapper);
    }
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = filter ? '이 분류의 업무가 없습니다.' : '할 일을 추가해 보세요.';
      list.append(empty);
    }
  }
}

element('task-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const title = element('title').value.trim();
  if (!title) {
    announce('할 일을 입력해 주세요. 공백만 추가할 수 없습니다.');
    element('title').focus();
    return;
  }
  const task = {
    id: crypto.randomUUID(), title,
    type: element('type').value,
    priority: Number(element('priority').value),
    deadline: element('deadline').value,
    category: element('category').value.trim() || '미분류',
    important: element('important').checked,
    date: selectedDate, completedDates: [], createdAt: Date.now()
  };
  if (await save([...tasks, task])) {
    element('title').value = '';
    element('title').focus();
  }
});
element('filter').addEventListener('change', render);
element('view-date').addEventListener('change', () => {
  const value = element('view-date').value;
  if (!value) {
    element('view-date').value = selectedDate;
    return;
  }
  selectedDate = value;
  element('filter').value = '';
  render();
});
element('go-today').addEventListener('click', () => {
  selectedDate = localDate();
  element('filter').value = '';
  render();
});
element('clear-all').addEventListener('click', () => {
  element('clear-confirmation').hidden = false;
  element('cancel-clear').focus();
});
element('cancel-clear').addEventListener('click', () => {
  element('clear-confirmation').hidden = true;
  element('clear-all').focus();
});
element('confirm-clear').addEventListener('click', async () => {
  if (await save([])) {
    element('clear-confirmation').hidden = true;
    announce('모든 날짜의 할 일과 데일리 업무를 삭제했습니다.');
  }
});

async function initialize() {
  try {
    element('version').textContent = `v${chrome.runtime.getManifest().version} · 변경 내역`;
    const stored = await chrome.storage.local.get('tasks');
    tasks = stored.tasks || [];
    render();
    setInterval(() => { if (!busy) render(); }, 30000);
  } catch (error) {
    announce('목록을 불러오지 못했습니다. 확장 프로그램을 다시 열어 주세요.');
    document.querySelectorAll('main > :not(#exchange) :is(button, input, select)').forEach((control) => { control.disabled = true; });
  }
}
initialize();

