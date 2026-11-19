const form = document.getElementById("add-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");

let todos = [];

function isCompleted(todo) {
  return todo.completed ?? todo.done ?? false;
}

// 저장된 목록 불러오기 (팝업을 다시 열어도 유지)
chrome.storage.local.get({ todos: [] }, (data) => {
  todos = data.todos;
  render();
});

function save() {
  chrome.storage.local.set({ todos });
}

function render() {
  list.innerHTML = "";

  todos.forEach((todo) => {
    const li = document.createElement("li");
    if (isCompleted(todo)) li.classList.add("done");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isCompleted(todo);
    checkbox.title = "완료 체크";
    checkbox.setAttribute("aria-label", `${todo.text} 완료`);
    checkbox.addEventListener("change", () => {
      todo.completed = checkbox.checked;
      if ("done" in todo) todo.done = checkbox.checked;
      save();
      render();
      list.children[todos.indexOf(todo)]?.firstElementChild.focus();
    });

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = todo.text;

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      todos = todos.filter((t) => t.id !== todo.id);
      save();
      render();
    });

    li.append(checkbox, text);

    // 지메일에서 추가한 할 일은 원래 메일로 돌아가는 링크를 붙임
    if (todo.url) {
      const open = document.createElement("button");
      open.className = "open";
      open.textContent = "메일";
      open.title = "메일 열기";
      open.addEventListener("click", () => {
        chrome.tabs.create({ url: todo.url });
      });
      li.appendChild(open);
    }

    li.appendChild(del);
    list.appendChild(li);
  });

  const remaining = todos.filter((todo) => !isCompleted(todo)).length;
  countEl.textContent = `남은 할 일 ${remaining}개`;
  emptyEl.hidden = todos.length > 0;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();

  // 빈칸(공백만 입력 포함)은 추가하지 않음
  if (!text) {
    errorEl.hidden = false;
    input.value = "";
    input.focus();
    return;
  }

  errorEl.hidden = true;
  todos.unshift({ id: crypto.randomUUID(), text, completed: false });
  save();
  render();
  input.value = "";
  input.focus();
});

input.addEventListener("input", () => {
  errorEl.hidden = true;
});
