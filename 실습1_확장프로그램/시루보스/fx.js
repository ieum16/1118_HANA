import { CURRENCIES, calculate, parseRates } from './fx-core.mjs';

const KEY = 'dontForgetExchangeV1';
const $ = selector => document.querySelector(selector);
const fields = ['amount', 'spread', 'discount'];
let state = {
  currency: 'USD', paste: '',
  values: Object.fromEntries(CURRENCIES.map(code => [code, { rate: '', amount: '100', spread: '0', discount: '0' }]))
};
let queue = Promise.resolve();
let revision = 0;
const money = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value) + '원';
const rateFormat = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);

function status(text, error = false) {
  $('#fx-status').textContent = text;
  $('#fx-status').classList.toggle('error', error);
}

function save() {
  const snapshot = JSON.parse(JSON.stringify(state));
  const current = ++revision;
  status('저장 중…');
  queue = queue.catch(() => {}).then(() => chrome.storage.local.set({ [KEY]: snapshot })).then(() => {
    if (current === revision) status('입력값을 저장했어요.');
  }).catch(() => { if (current === revision) status('저장하지 못했어요. ‘다시 저장’을 눌러 주세요.', true); });
}

function results() {
  const code = state.currency;
  const values = state.values[code];
  const result = calculate(code, values);
  $('#fx-unit').textContent = code === 'JPY' ? '기준환율은 100엔당 원화 · 금액은 엔 단위' : '기준환율은 1' + (code === 'USD' ? '달러' : '유로') + '당 원화';
  $('#fx-amount-label').textContent = '외화 금액 (' + code + ')';
  $('#fx-error').textContent = values.rate === '' ? '기준환율을 입력하면 계산해 드려요.' : result.error || '';
  for (const type of ['base', 'buy', 'sell']) $('#fx-' + type).textContent = result.error ? '—' : money(result[type]);
  $('#fx-applied').textContent = result.error ? '' : '적용 환율: 살 때 ' + rateFormat(result.buyRate) + '원 · 팔 때 ' + rateFormat(result.sellRate) + '원' + (code === 'JPY' ? ' / 100엔' : ' / 1' + code);
}

function showCurrency() {
  $('#fx-currency').value = state.currency;
  for (const name of fields) $('#fx-' + name).value = state.values[state.currency][name];
  results();
}

async function initExchange() {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY];
    if (stored && typeof stored === 'object') {
      if (CURRENCIES.includes(stored.currency)) state.currency = stored.currency;
      if (typeof stored.paste === 'string') state.paste = stored.paste.slice(0, 20000);
      for (const code of CURRENCIES) for (const key of ['rate', ...fields]) {
        const value = stored.values?.[code]?.[key];
        if (typeof value === 'string' && value.length <= 100) state.values[code][key] = value;
      }
    }
  } catch {
    status('입력값을 불러오지 못했어요. 창을 다시 열어 주세요.', true);
    return;
  }
  for (const code of CURRENCIES) {
    const input = $('#fx-rate-' + code);
    input.value = state.values[code].rate;
    input.addEventListener('input', () => { state.values[code].rate = input.value; results(); save(); });
  }
  for (const name of fields) $('#fx-' + name).addEventListener('input', event => {
    state.values[state.currency][name] = event.target.value;
    results(); save();
  });
  $('#fx-currency').addEventListener('change', event => { state.currency = event.target.value; showCurrency(); save(); });
  $('#fx-paste').value = state.paste;
  $('#fx-paste').addEventListener('input', event => { state.paste = event.target.value; save(); });
  $('#fx-import').addEventListener('click', () => {
    const { rates, warnings } = parseRates(state.paste);
    const codes = Object.keys(rates);
    for (const code of codes) {
      state.values[code].rate = String(rates[code]);
      $('#fx-rate-' + code).value = state.values[code].rate;
    }
    results();
    if (codes.length) save();
    $('#fx-import-status').textContent = (codes.length ? codes.join(' · ') + ' 기준환율을 채웠어요. 다른 통화의 값은 유지해요.' : '인식한 기준환율이 없어요. 통화와 매매기준율 열 머리글을 함께 붙여넣어 주세요.') + (warnings.length ? ' ' + warnings.join(' ') : '');
  });
  $('#fx-save').addEventListener('click', save);
  $('#fx-fields').disabled = false;
  showCurrency();
}
initExchange();
