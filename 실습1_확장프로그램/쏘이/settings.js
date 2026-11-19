import { $, send, status } from './ui.js';

function populate(data) {
  for (const id of ['personalId', 'teamId']) {
    const options = [new Option('선택해 주세요', '')];
    for (const calendar of data.calendars) {
      options.push(new Option((calendar.primary ? '기본 · ' : '') + (calendar.summaryOverride || calendar.summary), calendar.id));
    }
    $(id).replaceChildren(...options);
    $(id).value = data[id];
  }
}

async function load() {
  const data = await send('state');
  $('extensionId').textContent = data.extensionId;
  $('connectionState').textContent = data.configured ? 'OAuth ID가 등록되어 있어요. Google을 연결해 캘린더를 불러오세요.' : 'Google 연결 전이에요. 아래 안내를 먼저 진행해 주세요.';
  $('setupGuide').open = !data.configured;
  $('reminder1').value = data.reminderTimes[0];
  $('reminder2').value = data.reminderTimes[1];
  populate(data);
}

$('connect').onclick = async () => {
  $('connect').disabled = true;
  status('Google 연결을 기다리고 있어요…');
  try {
    const data = await send('connect');
    populate(data);
    status(`쓰기 가능한 캘린더 ${data.calendars.length}개를 불러왔어요. 아래에서 선택 후 설정을 저장하세요.`);
  } catch (error) { status(error.message, true); }
  finally { $('connect').disabled = false; }
};
$('settingsForm').onsubmit = async event => {
  event.preventDefault();
  try {
    await send('settings', { personalId: $('personalId').value, teamId: $('teamId').value, reminderTimes: [$('reminder1').value, $('reminder2').value] });
    status('설정을 저장했어요.');
  } catch (error) { status(error.message, true); }
};
$('openTodo').onclick = () => send('open').catch(error => status(error.message, true));
load().catch(error => status(error.message, true));
