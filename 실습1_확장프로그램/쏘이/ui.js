export const $ = id => document.getElementById(id);
export async function send(type, payload = {}) {
  const reply = await chrome.runtime.sendMessage({ type, ...payload });
  if (!reply?.ok) throw new Error(reply?.error || '확장 프로그램을 새로고침한 뒤 창을 다시 열어 주세요.');
  return reply.data;
}
export function status(text, error = false) {
  $('status').textContent = text;
  $('status').className = error ? 'error' : 'success';
}
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
