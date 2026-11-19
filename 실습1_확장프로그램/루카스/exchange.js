const currency = document.querySelector("#currency");
const amount = document.querySelector("#amount");
const rate = document.querySelector("#rate");
const load = document.querySelector("#load-rate");
const status = document.querySelector("#rate-status");
const total = document.querySelector("#total");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 2 });
let activeRequest;

function calculate() {
  const result = amount.valueAsNumber * rate.valueAsNumber;
  total.value = Number.isFinite(result) && amount.valueAsNumber >= 0 && rate.valueAsNumber > 0
    ? won.format(result) : "—";
}

function clearFetchStatus() {
  activeRequest?.abort();
  activeRequest = undefined;
  load.disabled = false;
  status.textContent = "";
}

currency.addEventListener("change", () => {
  clearFetchStatus();
  rate.value = "";
  calculate();
});
amount.addEventListener("input", calculate);
rate.addEventListener("input", () => {
  clearFetchStatus();
  calculate();
});

load.addEventListener("click", async () => {
  const base = currency.value;
  const request = new AbortController();
  activeRequest = request;
  load.disabled = true;
  status.textContent = "환율을 불러오는 중이에요.";
  const timeout = setTimeout(() => request.abort(), 10_000);

  try {
    if (!/^[A-Z]{3}$/.test(base)) throw new Error("Invalid currency");
    const url = "https://api.frankfurter.dev/v2/providers/ecb/rate/" + base + "/KRW";
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok) throw new Error("Rate unavailable");
    const data = await response.json();
    if (data.base !== base || data.quote !== "KRW" || !Number.isFinite(data.rate)
        || data.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new Error("Invalid rate");
    }
    if (activeRequest !== request) return;
    rate.value = String(data.rate);
    status.textContent = "환율 기준일 " + data.date + " · 유럽중앙은행 기준 · 은행 고시와 다름";
    calculate();
  } catch {
    if (activeRequest === request) status.textContent = "환율을 가져오지 못했어요";
  } finally {
    clearTimeout(timeout);
    if (activeRequest === request) {
      activeRequest = undefined;
      load.disabled = false;
    }
  }
});
