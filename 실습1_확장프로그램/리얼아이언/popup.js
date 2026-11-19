const form = document.querySelector('#task-form');
const titleInput = document.querySelector('#task-title');
const addButton = document.querySelector('#add');
const detailsButton = document.querySelector('#details');
const message = document.querySelector('#message');
const monthHeading = document.querySelector('#month');
const previousButton = document.querySelector('#previous-month');
const nextButton = document.querySelector('#next-month');
const remaining = document.querySelector('#remaining');
const list = document.querySelector('#tasks');
const empty = document.querySelector('#empty');
const template = document.querySelector('#task-row');
const search = document.querySelector('#search');
const status = document.querySelector('#status');
const sort = document.querySelector('#sort');

const dialog = document.querySelector('#task-dialog');
const editForm = document.querySelector('#edit-form');
const editTitle = document.querySelector('#edit-title');
const scheduledDate = document.querySelector('#scheduled-date');
const weekday = document.querySelector('#weekday');
const dueDate = document.querySelector('#due-date');
const priority = document.querySelector('#priority');
const note = document.querySelector('#note');
const editMessage = document.querySelector('#edit-message');
const saveButton = document.querySelector('#save');
const cancelButton = document.querySelector('#cancel');

const priorities = { high: 0, normal: 1, low: 2 };
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
const lockName = 'monthly-tasks';
let selectedMonth;
let tasks = [];
let listState = 'loading';
let loadSequence = 0;
let editor;

function localDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(month) {
  return `tasks:${month}`;
}

function calendarDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function syncWeekday() {
  weekday.value = scheduledDate.value && scheduledDate.validity.valid
    ? String(calendarDate(scheduledDate.value).getUTCDay())
    : '';
}

function chooseWeekday() {
  if (weekday.value === '') {
    scheduledDate.value = '';
    return;
  }

  const hasDate = scheduledDate.value && scheduledDate.validity.valid;
  const today = localDate();
  const anchor = hasDate ? scheduledDate.value
    : (today.startsWith(editor.month) ? today : `${editor.month}-01`);
  const date = calendarDate(anchor);
  const requested = Number(weekday.value);
  const current = date.getUTCDay();
  const days = hasDate
    ? (requested + 6) % 7 - (current + 6) % 7
    : (requested - current + 7) % 7;
  const anchorMonth = date.getUTCMonth();
  date.setUTCDate(date.getUTCDate() + days);
  if (date.getUTCMonth() !== anchorMonth) date.setUTCDate(date.getUTCDate() + (days < 0 ? 7 : -7));
  scheduledDate.value = date.toISOString().slice(0, 10);
}

function resetFilters() {
  search.value = '';
  status.value = 'all';
}

function visibleTasks() {
  const query = search.value.trim().toLowerCase();
  const visible = tasks.filter(task => {
    const matchesStatus = status.value === 'all' || task.done === (status.value === 'done');
    const matchesQuery = task.title.toLowerCase().includes(query)
      || (task.note ?? '').toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });

  const byDate = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
  if (sort.value === 'date') visible.sort(byDate);
  if (sort.value === 'scheduled') {
    visible.sort((a, b) => (a.scheduledDate || '9999-99-99').localeCompare(b.scheduledDate || '9999-99-99'));
  }
  if (sort.value === 'priority') {
    visible.sort((a, b) => priorities[a.priority ?? 'normal'] - priorities[b.priority ?? 'normal'] || byDate(a, b));
  }
  return visible;
}

function taskRow(task, month, today) {
  const row = template.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector('input');
  const edit = row.querySelector('.edit');
  const remove = row.querySelector('.delete');
  const scheduled = row.querySelector('.scheduled');
  const due = row.querySelector('.due');
  const priorityLabel = row.querySelector('.priority');
  const noteText = row.querySelector('.note');

  row.dataset.id = task.id;
  row.querySelector('.task-name').textContent = task.title;
  checkbox.checked = task.done;
  edit.setAttribute('aria-label', `${task.title} 수정`);
  remove.setAttribute('aria-label', `${task.title} 삭제`);
  checkbox.addEventListener('change', () => {
    const done = checkbox.checked;
    updateTask(month, task.id, current => ({ ...current, done }));
  });
  edit.addEventListener('click', () => openEditor(task));
  remove.addEventListener('click', () => updateTask(month, task.id, () => null));

  scheduled.hidden = !task.scheduledDate;
  if (task.scheduledDate) {
    const date = calendarDate(task.scheduledDate);
    const dayName = weekdayNames[date.getUTCDay()];
    scheduled.dateTime = task.scheduledDate;
    scheduled.textContent = `예정 · ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${dayName})`;
  }

  due.hidden = !task.dueDate;
  if (task.dueDate) {
    const [, month, day] = task.dueDate.split('-').map(Number);
    const overdue = !task.done && task.dueDate < today;
    const label = overdue ? '기한 지남' : '마감';
    due.dateTime = task.dueDate;
    due.textContent = `${label} · ${month}월 ${day}일`;
    due.classList.toggle('overdue', overdue);
  }

  const priorityText = { high: '우선순위 높음', low: '우선순위 낮음' };
  priorityLabel.textContent = priorityText[task.priority] ?? '';
  priorityLabel.hidden = !priorityLabel.textContent;
  priorityLabel.classList.toggle('high', task.priority === 'high');
  row.querySelector('.task-info').hidden = scheduled.hidden && due.hidden && priorityLabel.hidden;
  noteText.textContent = task.note ?? '';
  noteText.hidden = !noteText.textContent;
  return row;
}

function render() {
  const activeControl = document.activeElement;
  const activeId = activeControl?.closest('li')?.dataset.id;
  const visible = visibleTasks();
  const today = localDate();
  const rows = document.createDocumentFragment();
  let nextFocus;

  for (const task of visible) {
    const row = taskRow(task, selectedMonth, today);
    if (task.id === activeId) {
      const control = activeControl.matches('input') ? 'input' : `.${activeControl.className}`;
      nextFocus = row.querySelector(control);
    }
    rows.append(row);
  }

  list.replaceChildren(rows);
  remaining.textContent = listState === 'ready'
    ? `남은 할 일 ${tasks.filter(task => !task.done).length}개 / 전체 ${tasks.length}개`
    : '';
  empty.hidden = visible.length > 0;
  if (listState === 'loading') empty.textContent = '목록을 불러오는 중이에요.';
  else if (listState === 'error') empty.textContent = '목록을 불러오지 못했어요. 이 달을 다시 선택해 주세요.';
  else if (search.value.trim() || status.value !== 'all') empty.textContent = '조건에 맞는 할 일이 없어요.';
  else empty.textContent = '이 달에 등록한 할 일이 없어요.';
  if (activeId) (nextFocus ?? titleInput).focus();
}

function setAddEnabled(enabled) {
  titleInput.disabled = !enabled;
  addButton.disabled = !enabled;
  detailsButton.disabled = !enabled;
}

async function showMonth(month) {
  if (month !== selectedMonth) resetFilters();
  const sequence = ++loadSequence;
  const key = monthKey(month);
  selectedMonth = month;
  tasks = [];
  listState = 'loading';
  message.textContent = '';
  const [year, number] = month.split('-').map(Number);
  monthHeading.textContent = `${year}년 ${number}월`;
  previousButton.disabled = month === '0001-01';
  nextButton.disabled = month === '9999-12';
  setAddEnabled(false);
  render();

  try {
    await navigator.locks.request(lockName, async () => {
      const result = await chrome.storage.local.get(key);
      if (sequence !== loadSequence) return;
      tasks = result[key] ?? [];
      listState = 'ready';
      setAddEnabled(true);
      render();
    });
  } catch {
    if (sequence !== loadSequence) return;
    listState = 'error';
    render();
  }
}

async function updateTask(month, id, change, destination = month, feedback = message) {
  feedback.textContent = '';
  const sourceKey = monthKey(month);
  const targetKey = monthKey(destination);

  try {
    return await navigator.locks.request(lockName, async () => {
      const stored = await chrome.storage.local.get([...new Set([sourceKey, targetKey])]);
      const source = stored[sourceKey] ?? [];
      const index = id ? source.findIndex(task => task.id === id) : source.length;
      if (index === -1) {
        feedback.textContent = '할 일이 이미 삭제되었거나 다른 달로 이동했어요.';
        return false;
      }

      const next = change(source[index]);
      const updates = {};
      if (sourceKey === targetKey) {
        source.splice(index, id ? 1 : 0, ...(next ? [next] : []));
        updates[sourceKey] = source;
      } else {
        if (id) {
          source.splice(index, 1);
          updates[sourceKey] = source;
        }
        updates[targetKey] = [...(stored[targetKey] ?? []), next];
      }

      await chrome.storage.local.set(updates);
      const currentKey = monthKey(selectedMonth);
      if (listState === 'ready' && updates[currentKey]) {
        tasks = updates[currentKey];
        render();
      }
      return true;
    });
  } catch {
    feedback.textContent = '저장하지 못했어요. 다시 시도해 주세요.';
    render();
    return false;
  }
}

function openEditor(task) {
  editor = { month: selectedMonth, id: task?.id };
  document.querySelector('#dialog-title').textContent = task ? '할 일 수정' : '할 일 상세 추가';
  editTitle.value = task?.title ?? titleInput.value.trim();
  scheduledDate.value = task?.scheduledDate ?? '';
  syncWeekday();
  dueDate.value = task?.dueDate ?? '';
  priority.value = task?.priority ?? 'normal';
  note.value = task?.note ?? '';
  editMessage.textContent = '';
  dialog.showModal();
}

function offsetMonth(step) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const next = new Date();
  next.setFullYear(year, month - 1 + step, 1);
  showMonth(localDate(next).slice(0, 7));
}

previousButton.addEventListener('click', () => offsetMonth(-1));
nextButton.addEventListener('click', () => offsetMonth(1));
document.querySelector('#current-month').addEventListener('click', () => showMonth(localDate().slice(0, 7)));
search.addEventListener('input', render);
status.addEventListener('change', render);
sort.addEventListener('change', render);
titleInput.addEventListener('input', () => { message.textContent = ''; });

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (addButton.disabled) return;

  const title = titleInput.value.trim();
  if (!title) {
    message.textContent = '할 일을 입력해 주세요.';
    titleInput.focus();
    return;
  }

  const month = selectedMonth;
  addButton.disabled = true;
  const saved = await updateTask(month, null, () => ({ id: crypto.randomUUID(), title, done: false }));
  if (selectedMonth !== month || listState !== 'ready') return;
  addButton.disabled = false;
  if (saved) {
    if (titleInput.value.trim() === title) titleInput.value = '';
    resetFilters();
    render();
  }
  titleInput.focus();
});

detailsButton.addEventListener('click', () => openEditor());
cancelButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => {
  if (saveButton.disabled) event.preventDefault();
});
editForm.addEventListener('input', () => { editMessage.textContent = ''; });
scheduledDate.addEventListener('input', syncWeekday);
weekday.addEventListener('change', chooseWeekday);

editForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (saveButton.disabled) return;
  const title = editTitle.value.trim();
  if (!title) {
    editMessage.textContent = '할 일을 입력해 주세요.';
    editTitle.focus();
    return;
  }
  const invalidDate = [scheduledDate, dueDate].find(field => !field.validity.valid);
  if (invalidDate) {
    const label = invalidDate === scheduledDate ? '예정일' : '마감일';
    editMessage.textContent = `${label}을 올바르게 입력해 주세요.`;
    invalidDate.focus();
    return;
  }

  const { month, id } = editor;
  const details = {
    title,
    scheduledDate: scheduledDate.value,
    dueDate: dueDate.value,
    priority: priority.value,
    note: note.value.trim(),
  };
  const date = details.scheduledDate || details.dueDate;
  const destination = date ? date.slice(0, 7) : month;
  saveButton.disabled = true;
  cancelButton.disabled = true;
  const saved = await updateTask(month, id, current => ({
    ...(current ?? { id: crypto.randomUUID(), done: false }),
    ...details,
  }), destination, editMessage);
  saveButton.disabled = false;
  cancelButton.disabled = false;
  if (!saved) return;

  dialog.close();
  if (!id) {
    titleInput.value = '';
    resetFilters();
  }
  if (destination !== month) {
    await showMonth(destination);
    if (selectedMonth === destination && listState === 'ready') {
      const label = details.scheduledDate ? '예정일' : '마감일';
      message.textContent = id ? `${label}에 맞춰 할 일을 이동했어요.` : `${label}이 있는 달에 추가했어요.`;
    }
  } else {
    render();
  }
  const editedRow = [...list.children].find(row => row.dataset.id === id);
  (editedRow?.querySelector('.edit') ?? titleInput).focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  const key = monthKey(selectedMonth);
  if (area !== 'local' || !changes[key] || listState !== 'ready') return;
  tasks = changes[key].newValue ?? [];
  render();
});

showMonth(localDate().slice(0, 7));
