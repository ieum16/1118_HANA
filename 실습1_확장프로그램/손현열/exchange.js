const ratesButton = document.querySelector("#refresh-rates");
const todayRatesButton = document.querySelector("#load-today-rates");
const ratesStatus = document.querySelector("#exchange-status");
const ratesDate = document.querySelector("#exchange-date");
const ratesList = document.querySelector("#exchange-rates");
const currencySelect = document.querySelector("#exchange-currency");
const foreignAmount = document.querySelector("#exchange-amount");
const conversionResult = document.querySelector("#exchange-result");
const currencies = [
  { code: "USD", name: "미국 달러", unit: 1 },
  { code: "EUR", name: "유로", unit: 1 },
  { code: "JPY", name: "일본 엔", unit: 100 },
];
let loadingRates = false;
let displayedDates = "";

function updateConversion() {
  const currency = currencies.find((entry) => entry.code === currencySelect.value);
  const rateInput = document.querySelector(`#base-rate-${currency.code}`);
  if (!rateInput || !rateInput.value || !rateInput.validity.valid || Number(rateInput.value) <= 0) {
    conversionResult.textContent = "기준환율을 불러오거나 입력해 주세요.";
    return;
  }
  if (!foreignAmount.value || !foreignAmount.validity.valid) {
    conversionResult.textContent = "올바른 외화 금액을 입력해 주세요.";
    return;
  }
  const amount = Number(foreignAmount.value) * Number(rateInput.value) / currency.unit;
  conversionResult.textContent = Number.isFinite(amount)
    ? `${amount.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`
    : "계산할 수 있는 금액을 입력해 주세요.";
}

function renderRateInputs() {
  for (const currency of currencies) {
    const row = document.createElement("div");
    row.className = "exchange-row";
    const term = document.createElement("dt");
    const label = document.createElement("label");
    label.htmlFor = `base-rate-${currency.code}`;
    label.textContent = `${currency.name} · ${currency.unit} ${currency.code}`;
    term.append(label);
    const value = document.createElement("dd");
    const input = document.createElement("input");
    input.id = `base-rate-${currency.code}`;
    input.type = "number";
    input.min = "0.000001";
    input.step = "any";
    input.inputMode = "decimal";
    input.placeholder = "기준환율";
    input.setAttribute("aria-label", `${currency.unit} ${currency.code} 기준환율 (원)`);
    input.addEventListener("input", updateConversion);
    value.append(input, document.createTextNode(" 원"));
    row.append(term, value);
    ratesList.append(row);
  }
}

async function loadExchangeRates() {
  if (loadingRates) return;
  loadingRates = true;
  ratesButton.disabled = true;
  todayRatesButton.disabled = true;
  ratesStatus.textContent = "환율을 불러오는 중…";
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rates?base=KRW&quotes=USD,EUR,JPY&providers=ecb", {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Rate request failed");
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid rate data");
    const selected = currencies.map((currency) => {
      const row = rows.find((entry) => entry.base === "KRW" && entry.quote === currency.code);
      if (!row || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        throw new Error("Missing rate data");
      }
      return { ...currency, date: row.date, amount: currency.unit / row.rate };
    });
    for (const currency of selected) {
      document.querySelector(`#base-rate-${currency.code}`).value = String(Number(currency.amount.toFixed(6)));
    }
    const dates = [...new Set(selected.map((currency) => currency.date))].sort();
    displayedDates = dates.length === 1 ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`;
    ratesDate.textContent = `불러온 환율 기준일 ${displayedDates}`;
    ratesStatus.textContent = "오늘 환율을 불러왔어요";
    updateConversion();
  } catch {
    ratesStatus.textContent = "환율을 가져오지 못했어요";
  } finally {
    loadingRates = false;
    ratesButton.disabled = false;
    todayRatesButton.disabled = false;
  }
}

ratesButton.addEventListener("click", loadExchangeRates);
todayRatesButton.addEventListener("click", loadExchangeRates);
currencySelect.addEventListener("change", updateConversion);
foreignAmount.addEventListener("input", updateConversion);
renderRateInputs();
loadExchangeRates();
