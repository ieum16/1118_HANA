import { dayKey } from './core.js';
import { $, send, status, element } from './ui.js';

let data;
let submitting = false;
let addingDaily = false;
$('settings').onclick = () => chrome.runtime.openOptionsPage();

function selectListTab(history) {
  $('activeTasks').hidden = history;
  $('taskHistory').hidden = !history;
  $('activeTab').setAttribute('aria-selected', String(!history));
  $('historyTab').setAttribute('aria-selected', String(history));
  $('activeTab').tabIndex = history ? -1 : 0;
  $('historyTab').tabIndex = history ? 0 : -1;
}
$('activeTab').onclick = () => selectListTab(false);
$('historyTab').onclick = () => selectListTab(true);
for (const id of ['activeTab', 'historyTab']) {
  $(id).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const history = event.key === 'End' || (event.key !== 'Home' && id === 'activeTab');
    selectListTab(history);
    $(history ? 'historyTab' : 'activeTab').focus();
  });
}

function dailyStatus(text, error = false, target = 'dailyStatus') {
  $(target).textContent = text;
  $(target).className = error ? 'error' : 'success';
}

async function dailyAction(type, id) {
  try {
    await send(type, { id });
    await refresh();
  } catch (error) {
    dailyStatus(error.message, true);
    await refresh().catch(() => {});
  }
}

function repeatItem(task) {
  const today = dayKey();
  const occurrence = data.dailyOccurrences.find(item => item.id === `${task.id}/${today}`);
  const done = Boolean(occurrence?.acknowledged);
  const item = element('li', undefined, `daily-row${done ? ' done' : ''}${task.enabled ? '' : ' paused'}`);
  const copy = element('div', undefined, 'task-copy repeat-copy');
  copy.append(element('span', task.text, 'task-title'));
  copy.append(element('span', `${task.enabled ? '매일' : '일시정지'} ${task.time}`, 'repeat-time'));
  const controls = element('div', undefined, 'daily-controls');
  const complete = element('button', done ? '처리 완료' : '처리했음', 'daily-complete');
  complete.type = 'button';
  complete.disabled = done || !task.enabled;
  complete.setAttribute('aria-label', task.text + (done ? ' 오늘 처리 완료' : ' 오늘 처리했음'));
  complete.onclick = async () => {
    complete.disabled = true;
    await dailyAction('dailyComplete', task.id);
  };
  const menu = element('details', undefined, 'daily-menu');
  const summary = element('summary', '⋯');
  summary.setAttribute('aria-label', task.text + ' 관리');
  const menuItems = element('div', undefined, 'daily-menu-items');
  const toggle = element('button', task.enabled ? '일시정지' : '다시 켜기');
  toggle.type = 'button';
  toggle.onclick = () => dailyAction('dailyToggle', task.id);
  const remove = element('button', '삭제', 'delete');
  remove.type = 'button';
  remove.setAttribute('aria-label', task.text + ' 반복 삭제');
  remove.onclick = () => dailyAction('dailyDelete', task.id);
  menuItems.append(toggle, remove);
  menu.append(summary, menuItems);
  controls.append(complete, menu);
  item.append(copy, controls);
  return item;
}

$('dailyForm').onsubmit = async event => {
  event.preventDefault();
  if (addingDaily) return;
  addingDaily = true;
  $('dailyAdd').disabled = true;
  try {
    await send('dailyAdd', { text: $('dailyText').value, time: $('dailyTime').value });
    $('dailyText').value = '';
    await refresh();
    dailyStatus('매일 반복할 일을 추가했어요. 이미 지난 시간은 내일부터 알려드려요.', false, 'dailyFormStatus');
  } catch (error) { dailyStatus(error.message, true, 'dailyFormStatus'); }
  finally { addingDaily = false; $('dailyAdd').disabled = false; }
};
$('dailyTest').onclick = () => dailyAction('dailyTest');

function updateForm() {
  const dated = Boolean($('taskDate').value);
  $('taskTime').disabled = !dated;
  if (!dated) $('taskTime').value = '';
  $('calendarChoice').hidden = !dated;
  $('addButton').textContent = dated ? '캘린더에 등록' : '할 일 추가';
  $('formHint').textContent = dated ? '시간을 비우면 종일 일정, 입력하면 1시간 일정으로 저장돼요. 시간은 이 컴퓨터의 현지 시간 기준이에요.' : '날짜를 비워 두면 하루 투두리스트에 추가돼요.';
  $('connectionHint').textContent = data?.calendars.length ? '설정에서 연결한 캘린더에 저장해요.' : '먼저 설정에서 Google Calendar를 연결해 주세요.';
}
$('taskDate').addEventListener('change', updateForm);
$('taskDate').addEventListener('input', () => {
  updateForm();
  if (!$('taskDate').value && !submitting) status('');
});
$('clearDate').onclick = () => {
  $('taskDate').value = '';
  updateForm();
  status('');
  $('taskText').focus();
};

async function act(type, id, payload = {}) {
  try {
    const result = await send(type, { id, ...payload });
    await refresh();
    if (type === 'toggle' && result.done) $('greeting').textContent = '참 잘했어요! 하나씩 해내고 있어요.';
    if (type === 'retry') status(result.sync === 'saved' ? '캘린더에 저장했어요.' : result.error, result.sync !== 'saved');
  } catch (error) {
    status(error.message, true);
    await refresh().catch(() => {});
  }
}

function dailyItem(task) {
  const item = element('li', undefined, `todo-row${task.done ? ' done' : ''}${task.urgent ? ' urgent' : ''}`);
  const check = element('input');
  check.type = 'checkbox';
  check.checked = task.done;
  check.setAttribute('aria-label', task.text + ' 완료');
  check.onchange = async () => { check.disabled = true; await act('toggle', task.id); };
  const copy = element('div', undefined, 'task-copy');
  copy.append(element('span', task.text, 'task-title'));
  if (task.done) {
    const completed = new Date(task.completedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    copy.append(element('div', completed + ' 완료', 'hint'));
    check.setAttribute('aria-label', task.text + ' 완료 취소');
  }
  if (task.createdDay !== dayKey() && !task.done) copy.append(element('div', task.createdDay + '부터 이어진 할 일', 'hint'));
  const remove = element('button', '×', 'delete');
  remove.type = 'button';
  remove.setAttribute('aria-label', task.text + ' 삭제');
  remove.onclick = () => act('delete', task.id);
  const urgentLabel = element('label', undefined, 'urgent-toggle');
  const urgentCheck = element('input');
  urgentCheck.type = 'checkbox';
  urgentCheck.checked = Boolean(task.urgent);
  urgentCheck.setAttribute('aria-label', task.text + ' 긴급');
  urgentCheck.onchange = async () => {
    urgentCheck.disabled = true;
    await act('setUrgent', task.id, { urgent: urgentCheck.checked });
  };
  urgentLabel.append(urgentCheck, element('span', '긴급'));
  item.append(check, copy, urgentLabel, remove);
  return item;
}

function eventItem(task) {
  const item = element('li');
  const copy = element('div', undefined, 'task-copy');
  copy.append(element('div', task.text));
  copy.append(element('div', `${task.date} · ${task.time ? task.time + '부터 1시간' : '종일'} · ${task.calendarName}`, 'hint'));
  if (task.sync === 'saved') {
    copy.append(element('div', '캘린더 저장 완료', 'success'));
    if (task.eventUrl?.startsWith('https://')) {
      const link = element('a', '캘린더에서 보기·수정', 'event-link');
      link.href = task.eventUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      copy.append(link);
    }
  } else {
    copy.append(element('div', task.error || '저장 완료 확인이 필요해요.', 'error'));
    const retry = element('button', '다시 저장', 'retry');
    retry.onclick = async () => { retry.disabled = true; await act('retry', task.id); };
    copy.append(retry);
  }
  item.append(copy);
  return item;
}

async function refresh() {
  data = await send('state');
  const today = dayKey();
  const daily = data.tasks.filter(t => !t.date && !t.done);
  const urgent = daily.filter(task => task.urgent);
  const regular = daily.filter(task => !task.urgent);
  const history = data.tasks.filter(t => !t.date && t.done).sort((a, b) => b.completedAt - a.completedAt);
  const events = data.tasks.filter(t => t.date).sort((a, b) => b.date.localeCompare(a.date));
  $('dailyTaskList').replaceChildren(...data.dailyTasks.map(repeatItem));
  $('dailyEmpty').hidden = data.dailyTasks.length > 0;
  $('urgentList').replaceChildren(...urgent.map(dailyItem));
  $('urgentList').hidden = urgent.length === 0;
  $('urgentHeading').hidden = urgent.length === 0;
  $('dailyList').replaceChildren(...regular.map(dailyItem));
  $('historyList').replaceChildren(...history.map(dailyItem));
  $('historyEmpty').hidden = history.length > 0;
  $('eventList').replaceChildren(...events.map(eventItem));
  $('empty').hidden = daily.length > 0;
  $('eventEmpty').hidden = events.length > 0;
  const recurring = data.dailyTasks.filter(task => task.enabled);
  const recurringDone = recurring.filter(task => data.dailyOccurrences.some(item => item.id === `${task.id}/${today}` && item.acknowledged)).length;
  $('count').textContent = `남은 ${daily.length + recurring.length - recurringDone}개`;
  $('today').textContent = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  $('reminderHint').textContent = `미완료 할 일이 있으면 매일 ${data.reminderTimes.join(', ')}에 다시 만나요. Chrome이 실행 중일 때 창이 열려요.`;
  updateForm();
}

$('taskForm').onsubmit = async event => {
  event.preventDefault();
  if (submitting) return;
  submitting = true;
  $('addButton').disabled = true;
  updateForm();
  const payload = { text: $('taskText').value, date: $('taskDate').value, time: $('taskTime').value, urgent: $('taskUrgent').checked, target: document.querySelector('input[name=target]:checked').value };
  try {
    const task = await send('add', payload);
    $('taskForm').reset();
    await refresh();
    status(task.date ? (task.sync === 'saved' ? '선택한 캘린더에 저장했어요!' : '할 일은 보관했어요. 캘린더 저장 실패 · ' + task.error) : '오늘의 할 일을 추가했어요!', task.sync === 'error');
  } catch (error) { status(error.message, true); }
  finally { submitting = false; $('addButton').disabled = false; }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') refresh().catch(error => status(error.message, true));
});
// 자정에 열린 창도 오늘의 목록으로 전환한다.
let shownDay = dayKey();
setInterval(() => {
  if (shownDay !== dayKey()) {
    shownDay = dayKey();
    refresh().catch(error => status(error.message, true));
  }
}, 30000);
refresh().catch(error => status(error.message, true));
