import { $, send, status, element } from './ui.js';
import { dayKey } from './core.js';

async function render() {
  const data = await send('state');
  const visible = data.dailyOccurrences.filter(item => item.day === dayKey() || (!item.acknowledged && !item.dismissed));
  const pending = visible.filter(item => !item.acknowledged && !item.dismissed);
  $('alerts').replaceChildren(...visible.map(item => {
    const row = element('li', undefined, item.acknowledged ? 'done' : '');
    const copy = element('div', undefined, 'task-copy');
    copy.append(element('div', item.text, 'task-title'), element('div', `${item.day} · ${item.time}`, 'hint'));
    const button = element('button', item.acknowledged ? '처리 완료' : item.dismissed ? '알림 닫음' : '처리했음', 'confirm-daily');
    button.disabled = item.acknowledged || item.dismissed;
    button.onclick = async () => {
      button.disabled = true;
      try { await send('dailyAcknowledge', { id: item.id }); }
      catch (error) { status(error.message, true); button.disabled = false; }
    };
    row.append(copy, button);
    return row;
  }));
  $('soundError').textContent = pending.length ? data.dailySoundError : '';
  $('retrySound').hidden = !pending.length || !data.dailySoundError;
  $('alertHint').textContent = pending.length ? '처리했음을 누르면 해당 항목을 완료해요. 모두 처리하면 소리가 멈춰요. 창은 직접 닫아 주세요.' : '알림 확인이 끝났어요. 창은 직접 닫을 때까지 유지돼요.';
}
$('retrySound').onclick = () => send('dailySoundRetry').catch(error => status(error.message, true));
$('closeAlert').onclick = () => window.close();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.dailyOccurrences || changes.dailySoundError)) render().catch(error => status(error.message, true));
});
render().catch(error => status(error.message, true));
