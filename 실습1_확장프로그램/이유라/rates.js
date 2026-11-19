const refreshRates = document.getElementById("refresh-rates");
const rateList = document.getElementById("rate-list");
const rateStatus = document.getElementById("rates-status");

const currencies = [
  { code: "USD", name: "미국 달러", units: 1 },
  { code: "EUR", name: "유로", units: 1 },
  { code: "JPY", name: "일본 엔", units: 100 },
  { code: "CNY", name: "중국 위안", units: 1 },
];
const won = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const cacheLifetime = 60 * 60 * 1000;

function setRateStatus(message) {
  rateStatus.textContent = message;
  rateStatus.hidden = !message;
}

function renderRates(quotes) {
  const rows = currencies.map(({ code, name, units }) => {
    const { rate, date } = quotes[code];
    const row = document.createElement("div");
    row.className = "rate-row";
    if (code === "USD") row.classList.add("is-usd");

    const label = document.createElement("dt");
    label.textContent = name;
    const unit = document.createElement("span");
    unit.className = "rate-meta";
    unit.textContent = `${units} ${code}`;
    label.append(unit);

    const value = document.createElement("dd");
    value.textContent = `${won.format(rate * units)}원`;
    const published = document.createElement("time");
    published.className = "rate-meta";
    published.dateTime = date;
    published.textContent = `${date} 기준`;
    value.append(published);

    row.append(label, value);
    return row;
  });
  rateList.replaceChildren(...rows);
  rateList.hidden = false;
}

async function fetchRate(code, signal) {
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${code}/KRW`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Exchange rate request failed (${response.status})`);

  const { base, quote, rate, date } = await response.json();
  if (base !== code || quote !== "KRW" || !Number.isFinite(rate) || rate <= 0 ||
      typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid exchange rate response");
  }
  return [code, { rate, date }];
}

async function loadRates(force = false) {
  if (refreshRates.disabled) return;
  refreshRates.disabled = true;

  try {
    const { exchangeRates } = await chrome.storage.local.get("exchangeRates");
    if (exchangeRates) {
      renderRates(exchangeRates.quotes);
      if (!force && Date.now() - exchangeRates.fetchedAt < cacheLifetime) {
        setRateStatus("");
        return;
      }
    }

    setRateStatus("환율을 불러오는 중이에요.");
    const signal = AbortSignal.timeout(8000);
    const entries = await Promise.all(currencies.map(({ code }) => fetchRate(code, signal)));
    const quotes = Object.fromEntries(entries);
    renderRates(quotes);
    setRateStatus("");
    await chrome.storage.local.set({ exchangeRates: { quotes, fetchedAt: Date.now() } }).catch(() => {});
  } catch {
    setRateStatus(rateList.hidden
      ? "환율을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요."
      : "최신 환율을 불러오지 못했어요. 마지막으로 받은 환율을 표시해요.");
  } finally {
    refreshRates.disabled = false;
  }
}

refreshRates.addEventListener("click", () => loadRates(true));
loadRates();
