// 지메일에서 메일을 열면 "할 일에 추가" 버튼을 보여 주는 스크립트

const button = document.createElement("button");
button.id = "todo-ext-add";
button.textContent = "+ 할 일에 추가";
button.hidden = true;

const toast = document.createElement("div");
toast.id = "todo-ext-toast";
toast.hidden = true;

document.body.append(button, toast);

// 지금 열려 있는 메일의 제목 (메일 목록 화면이면 null)
function getSubject() {
  const el = document.querySelector("h2.hP");
  if (!el || !el.offsetParent) return null;
  const text = el.textContent.trim();
  return text || null;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2000);
}

button.addEventListener("click", async () => {
  const subject = getSubject();
  if (!subject) return;
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "add",
      text: "[메일] " + subject,
      url: location.href
    });
    if (!result?.ok) throw new Error(result?.error);
    showToast(result.duplicate ? "이미 할 일에 있는 메일이에요." : "할 일에 추가했어요.");
  } catch {
    showToast("할 일을 저장하지 못했어요.");
  } finally {
    button.disabled = false;
  }
});

button.hidden = !getSubject();

let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    button.hidden = !getSubject();
  });
}).observe(document.body, { childList: true, subtree: true });
