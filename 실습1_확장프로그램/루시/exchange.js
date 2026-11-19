import { currencies, fetchHanaQuote, readNumber, units } from './hana-rates.js';

const fields = document.querySelector('#exchange-fields');
const amountInput = document.querySelector('#exchange-amount');
const currencySelect = document.querySelector('#exchange-currency');
const manualDetails = document.querySelector('#exchange-manual');
const useManual = document.querySelector('#exchange-use-manual');
const manualInputs = Object.fromEntries(currencies.map(code => [code, document.querySelector(`#rate-${code.toLowerCase()}`)]));
const bankOutputs = Object.fromEntries(currencies.map(code => [code, document.querySelector(`#hana-${code.toLowerCase()}`)]));
const refresh = document.querySelector('#hana-refresh');
const bankStatus = document.querySelector('#hana-status');
const validation = document.querySelector('#exchange-validation');
const storageStatus = document.querySelector('#exchange-storage-status');
const basis = document.querySelector('#exchange-basis');
const result = document.querySelector('#exchange-base');
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

let bankQuote = null;
let saveRevision = 0;

function renderAmount() {
  const currency = currencySelect.value;
  const amount = readNumber(amountInput.value);
  const manualRate = readNumber(manualInputs[currency].value);
  const rate = useManual.checked ? manualRate : bankQuote?.rates[currency];
  const validAmount = amount !== null;
  const validRate = rate > 0;

  for (const input of Object.values(manualInputs)) {
    input.setAttribute('aria-invalid', String(Boolean(input.value.trim()) && !(readNumber(input.value) > 0)));
  }
  amountInput.setAttribute('aria-invalid', String(Boolean(amountInput.value.trim()) && !validAmount));
  basis.textContent = useManual.checked ? '직접 입력 기준 원화' : '고시환율 기준 원화';
  const converted = validAmount && validRate ? (amount / units[currency]) * rate : null;
  result.textContent = Number.isFinite(converted) ? `${won.format(converted)}원` : '—';

  if (amountInput.value.trim() && !validAmount) {
    validation.textContent = '외화 금액은 0 이상의 숫자로 입력해 주세요.';
  } else if (useManual.checked && !validRate) {
    validation.textContent = `${currency} 기준환율을 0보다 큰 숫자로 입력해 주세요.`;
  } else {
    validation.textContent = '';
  }
}

async function saveExchange() {
  const revision = ++saveRevision;
  const exchange = {
    currency: currencySelect.value,
    amount: amountInput.value,
    useManual: useManual.checked,
    manualRates: Object.fromEntries(currencies.map(code => [code, manualInputs[code].value]))
  };
  try {
    await chrome.storage.local.set({ exchange });
    if (revision === saveRevision) storageStatus.textContent = '';
  } catch {
    if (revision === saveRevision) storageStatus.textContent = '환율 입력값을 저장하지 못했어요. 다시 입력해 주세요.';
  }
}

function showBankQuote(message) {
  for (const code of currencies) {
    bankOutputs[code].textContent = bankQuote ? `${rateFormat.format(bankQuote.rates[code])}원` : '—';
  }
  bankStatus.textContent = message;
  renderAmount();
}

async function refreshBankQuote() {
  refresh.disabled = true;
  bankStatus.textContent = bankQuote
    ? `새 고시 조회 중 · 표시값 ${bankQuote.publishedAt}`
    : '고시환율 조회 중…';
  try {
    bankQuote = await fetchHanaQuote();
    showBankQuote(`${bankQuote.publishedAt} 고시`);
    chrome.storage.local.set({ hanaQuote: bankQuote }).catch(() => {});
  } catch {
    showBankQuote(bankQuote
      ? `조회 실패 · 저장된 ${bankQuote.publishedAt} 고시`
      : '고시환율을 불러오지 못했어요. 새로고침하거나 기준환율을 직접 입력해 주세요.');
  } finally {
    refresh.disabled = false;
  }
}

fields.addEventListener('input', () => {
  renderAmount();
  saveExchange();
});

refresh.addEventListener('click', refreshBankQuote);

async function loadExchange() {
  try {
    const { exchange, hanaQuote } = await chrome.storage.local.get(['exchange', 'hanaQuote']);
    currencySelect.value = currencies.includes(exchange?.currency) ? exchange.currency : 'USD';
    amountInput.value = exchange?.amount ?? '';
    useManual.checked = exchange?.useManual === true;
    manualDetails.open = useManual.checked;
    for (const code of currencies) {
      manualInputs[code].value = exchange?.manualRates?.[code] ?? exchange?.rates?.[code]?.base ?? '';
    }
    if (hanaQuote?.publishedAt && currencies.every(code => hanaQuote.rates?.[code] > 0)) bankQuote = hanaQuote;
  } catch {
    storageStatus.textContent = '저장된 환율 입력값을 불러오지 못했어요.';
  }

  fields.disabled = false;
  if (bankQuote && Date.now() - bankQuote.fetchedAt < 60_000) {
    showBankQuote(`${bankQuote.publishedAt} 고시`);
    refresh.disabled = false;
  } else {
    showBankQuote(bankQuote ? `저장된 ${bankQuote.publishedAt} 고시` : '고시환율 조회 중…');
    refreshBankQuote();
  }
}

loadExchange();
