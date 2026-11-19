const audio = document.getElementById('alarm');
audio.volume = 0.65;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'soy-audio') return false;
  audio.play().then(() => respond({ ok: true }), error => respond({ error: '알림음 재생 실패 · ' + error.message }));
  return true;
});
