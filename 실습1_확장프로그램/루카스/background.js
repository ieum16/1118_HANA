let pending = Promise.resolve();

async function updateTodos(message, sender) {
  const { todos } = await chrome.storage.local.get({ todos: [] });
  const { id, type, done } = message;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const dueDate = message.dueDate || "";
  const index = todos.findIndex(todo => todo.id === id);

  if (type === "add" || type === "edit") {
    if (!text) throw new Error("할 일을 입력해 주세요.");
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new Error("마감일을 확인해 주세요.");
    }
  }

  if (type === "add") {
    const url = message.url;
    if (url) {
      if (typeof url !== "string" || !url.startsWith("https://mail.google.com/") ||
          !sender.url?.startsWith("https://mail.google.com/")) {
        throw new Error("메일 주소를 확인해 주세요.");
      }
      if (todos.some(todo => todo.url === url)) {
        return { ok: true, duplicate: true };
      }
    }
    todos.push({ id: crypto.randomUUID(), text, dueDate, done: false, ...(url ? { url } : {}) });
  } else {
    if (index < 0) throw new Error("이 할 일이 목록에 없어요.");
    if (type === "edit") Object.assign(todos[index], { text, dueDate });
    if (type === "toggle") todos[index].done = done === true;
    if (type === "delete") todos.splice(index, 1);
  }

  await chrome.storage.local.set({ todos });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!["add", "edit", "toggle", "delete"].includes(message?.type)) return;
  if (sender.id !== chrome.runtime.id) return;
  if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL("")) && message.type !== "add") return;

  // Serialize writes from the popup and Gmail so they cannot overwrite each other.
  const update = pending.then(() => updateTodos(message, sender));
  pending = update.then(() => {}, () => {});
  update.then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
