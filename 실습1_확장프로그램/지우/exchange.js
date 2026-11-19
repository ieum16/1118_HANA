import { currencies, units, parseNumber, parseBankTable } from "./exchange-table.js";

const storageKey = "exchangeCalculator";
const endpoint = "https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,JPY,KRW&providers=ecb";
const byId = id => document.getElementById(`fx-${id}`);
const rateFields = Object.fromEntries(currencies.map(code => [code, document.querySelector(`[data-rate="${code}"]`)]));
const currency = byId("currency");
const discount = byId("discount");
const paste = byId("paste");
const loadButton = byId("fetch");
const importButton = byId("import");
const sourceLabel = byId("source");
const fetchStatus = byId("fetch-status");
const pasteStatus = byId("paste-status");
const storageStatus = byId("storage-status");
const validation = byId("validation");
const fields = Object.fromEntries(["amount", "buy", "sell"].map(key => [key, byId(key)]));
const formatWon = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const formatDate = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

let state = {
  currency: "USD",
  discount: "",
  paste: "",
  source: null,
  rates: Object.fromEntries(currencies.map(code => [code, { base: "", buy: "", sell: "", amount: "" }]))
};

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle("is-error", error);
}

function persist() {
  void chrome.storage.local.set({ [storageKey]: state }).then(
    () => setStatus(storageStatus, ""),
    () => setStatus(storageStatus, "환율 입력값을 저장하지 못했어요.", true)
  );
}

function readField(field, maximum = Infinity, positive = false) {
  const value = parseNumber(field.value);
  const valid = value !== null && value <= maximum && (!positive || value > 0);
  field.setAttribute("aria-invalid", String(Boolean(field.value.trim()) && !valid));
  return valid ? value : null;
}

function setResult(name, value, needsSpread = false) {
  const result = byId(`result-${name}`);
  result.classList.toggle("fx-result-hint", needsSpread);
  result.textContent = needsSpread ? "스프레드 입력 필요" : Number.isFinite(value) ? `${formatWon.format(value)}원` : "—";
}

function calculate() {
  const bases = Object.fromEntries(currencies.map(code => [code, readField(rateFields[code], Infinity, true)]));
  const base = bases[state.currency];
  const amount = readField(fields.amount);
  const buy = readField(fields.buy, 100);
  const sell = readField(fields.sell, 100);
  const discountPercent = readField(discount, 100);
  const remainingMargin = discount.value.trim() && discountPercent === null ? null : 1 - (discountPercent ?? 0) / 100;
  const total = base === null || amount === null ? NaN : (amount / units[state.currency]) * base;

  setResult("base", total);
  for (const [name, spread, sign] of [["buy", buy, 1], ["sell", sell, -1]]) {
    const result = spread === null || remainingMargin === null
      ? NaN
      : total * (1 + sign * (spread / 100) * remainingMargin);
    setResult(name, result, Number.isFinite(total) && !fields[name].value.trim());
  }

  const invalid = Object.values(rateFields).concat(Object.values(fields), discount)
    .some(field => field.getAttribute("aria-invalid") === "true");
  setStatus(validation, invalid ? "금액은 숫자로, 기준환율은 0보다 크게, 비율은 0~100 사이로 입력해 주세요." : "", true);
}

function showSource() {
  const source = state.source;
  sourceLabel.hidden = !source;
  sourceLabel.textContent = source
    ? `불러온 날짜 ${formatDate.format(new Date(source.fetchedAt))} · 기준일 ${source.date}\n유럽중앙은행 기준 · 은행 고시와 다름`
    : "";
}

function fillInputs() {
  for (const code of currencies) rateFields[code].value = state.rates[code].base;
  for (const [key, field] of Object.entries(fields)) field.value = state.rates[state.currency][key];
  showSource();
  calculate();
}

function invalidateSource() {
  state.source = null;
  showSource();
  setStatus(fetchStatus, "");
}

for (const [code, field] of Object.entries(rateFields)) {
  field.addEventListener("input", () => {
    state.rates[code].base = field.value;
    invalidateSource();
    calculate();
    persist();
  });
}

for (const [key, field] of Object.entries(fields)) {
  field.addEventListener("input", () => {
    state.rates[state.currency][key] = field.value;
    calculate();
    persist();
  });
}

currency.addEventListener("change", () => {
  state.currency = currency.value;
  fillInputs();
  persist();
});

discount.addEventListener("input", () => {
  state.discount = discount.value;
  calculate();
  persist();
});

paste.addEventListener("input", event => {
  state.paste = paste.value;
  setStatus(pasteStatus, "");
  if (event.inputType === "insertFromPaste" && !importButton.disabled && importTable()) return;
  persist();
});

function importTable() {
  const imported = Object.entries(parseBankTable(paste.value));
  if (!imported.length) {
    setStatus(pasteStatus, "읽을 수 있는 환율이 없어요. 열 제목과 통화 행을 함께 복사해 주세요.", true);
    return false;
  }

  for (const [code, values] of imported) {
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) state.rates[code][key] = value;
    }
  }
  invalidateSource();
  fillInputs();
  persist();
  setStatus(pasteStatus, `${imported.map(([code]) => code).join(" · ")} 환율을 채웠어요.`);
  return true;
}

importButton.addEventListener("click", importTable);

function readEcbRates(rows) {
  const quotes = {};
  for (const row of rows) {
    if (row.base === "EUR" && ["USD", "JPY", "KRW"].includes(row.quote) &&
        Number.isFinite(row.rate) && row.rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      quotes[row.quote] = row;
    }
  }
  const { KRW, USD, JPY } = quotes;
  if (!KRW || USD?.date !== KRW.date || JPY?.date !== KRW.date) throw new Error("Incomplete ECB rates");

  return {
    date: KRW.date,
    USD: KRW.rate / USD.rate,
    EUR: KRW.rate,
    JPY: (KRW.rate / JPY.rate) * units.JPY
  };
}

loadButton.addEventListener("click", async () => {
  const locked = [loadButton, importButton, ...Object.values(rateFields)];
  for (const field of locked) field.disabled = true;
  setStatus(fetchStatus, "환율을 불러오는 중이에요.");

  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Frankfurter HTTP ${response.status}`);
    const latest = readEcbRates(await response.json());

    for (const code of currencies) state.rates[code].base = String(Number(latest[code].toFixed(4)));
    state.source = { date: latest.date, fetchedAt: new Date().toISOString() };
    fillInputs();
    persist();
    setStatus(fetchStatus, "");
  } catch {
    setStatus(fetchStatus, "환율을 가져오지 못했어요", true);
  } finally {
    for (const field of locked) field.disabled = false;
  }
});

async function initialize() {
  try {
    const stored = (await chrome.storage.local.get(storageKey))[storageKey];
    if (stored) {
      state = { ...state, ...stored, rates: { ...state.rates, ...stored.rates } };
    }
    currency.value = state.currency;
    discount.value = state.discount;
    paste.value = state.paste;
    fillInputs();
    byId("controls").disabled = false;
  } catch {
    setStatus(storageStatus, "저장된 환율 입력값을 불러오지 못했어요.", true);
  }
}

void initialize();
