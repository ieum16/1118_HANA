const storageKey = 'todo-extension.tasks';
const form = document.querySelector('#add-task');
const titleInput = document.querySelector('#task-title');
const titleError = document.querySelector('#title-error');
const storageError = document.querySelector('#storage-error');
const list = document.querySelector('#tasks');
const template = document.querySelector('#task-template');
const remaining = document.querySelector('#remaining strong');
const emptyState = document.querySelector('#empty-state');
const tasks = loadTasks();

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) return saved;
    throw new Error('Invalid task list');
  } catch {
    storageError.textContent = '저장된 목록을 불러오지 못했어요.';
    storageError.hidden = false;
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    storageError.hidden = true;
  } catch {
    storageError.textContent = '변경 사항을 저장하지 못했어요.';
    storageError.hidden = false;
  }
}

function updateSummary() {
  const count = tasks.filter((task) => !task.done).length;
  remaining.textContent = `${count}개`;
  emptyState.hidden = tasks.length > 0;
}

function addTaskToList(task) {
  const row = template.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector('.task-done');
  const deleteButton = row.querySelector('.delete-button');
  const rating = row.querySelector('.rating');
  const stars = Array.from(rating.querySelectorAll('button'));
  const memo = row.querySelector('.task-memo');

  row.querySelector('.task-name').textContent = task.title;
  checkbox.checked = task.done;
  memo.value = task.memo;
  memo.setAttribute('aria-label', `${task.title} 비고`);
  rating.setAttribute('aria-label', `${task.title} 중요도`);
  deleteButton.setAttribute('aria-label', `${task.title} 삭제`);

  function updateStars() {
    stars.forEach((star, index) => {
      const score = index + 1;
      star.textContent = score <= task.priority ? '★' : '☆';
      star.setAttribute('aria-pressed', String(score === task.priority));
    });
  }

  stars.forEach((star, index) => {
    star.addEventListener('click', () => {
      const score = index + 1;
      task.priority = task.priority === score ? 0 : score;
      updateStars();
      saveTasks();
    });
  });
  updateStars();

  checkbox.addEventListener('change', () => {
    const newlyCompleted = checkbox.checked && !task.done;
    task.done = checkbox.checked;
    updateSummary();
    saveTasks();
    if (newlyCompleted) celebrateCompletion(checkbox);
  });
  memo.addEventListener('input', () => {
    task.memo = memo.value;
    saveTasks();
  });
  deleteButton.addEventListener('click', () => {
    const neighbor = row.nextElementSibling ?? row.previousElementSibling;
    tasks.splice(tasks.indexOf(task), 1);
    row.remove();
    updateSummary();
    saveTasks();
    (neighbor?.querySelector('.task-done') ?? titleInput).focus();
  });

  list.append(row);
}

titleInput.addEventListener('input', () => {
  titleError.hidden = true;
  titleInput.removeAttribute('aria-invalid');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.setAttribute('aria-invalid', 'true');
    titleError.textContent = '할 일을 입력해 주세요.';
    titleError.hidden = false;
    titleInput.focus();
    return;
  }

  const task = { title, done: false, priority: 0, memo: '' };
  tasks.push(task);
  addTaskToList(task);
  updateSummary();
  saveTasks();
  form.reset();
  titleInput.focus();
});

tasks.forEach(addTaskToList);
updateSummary();
