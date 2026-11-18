const STORAGE_KEY = "todos";

const form = document.querySelector("#todo-form");
const input = document.querySelector("#todo-input");
const error = document.querySelector("#input-error");
const list = document.querySelector("#todo-list");
const remaining = document.querySelector("#remaining");
const emptyMessage = document.querySelector("#empty-message");

let todos = [];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

async function loadTodos() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  todos = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
  render();
}

async function saveTodos() {
  await chrome.storage.local.set({ [STORAGE_KEY]: todos });
}

function render() {
  list.replaceChildren();

  for (const todo of todos) {
    const item = document.createElement("li");
    item.className = `todo-item${todo.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.setAttribute("aria-label", `${todo.text} 완료 표시`);
    checkbox.addEventListener("change", async () => {
      todo.completed = checkbox.checked;
      await saveTodos();
      render();
    });

    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = todo.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `${todo.text} 삭제`);
    deleteButton.addEventListener("click", async () => {
      todos = todos.filter((item) => item.id !== todo.id);
      await saveTodos();
      render();
    });

    item.append(checkbox, text, deleteButton);
    list.append(item);
  }

  const remainingCount = todos.filter((todo) => !todo.completed).length;
  remaining.textContent = `남은 할 일 ${remainingCount}개`;
  emptyMessage.hidden = todos.length > 0;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) {
    error.textContent = "할 일을 입력해 주세요.";
    input.focus();
    return;
  }

  error.textContent = "";
  todos.unshift({ id: makeId(), text, completed: false });
  await saveTodos();
  input.value = "";
  render();
  input.focus();
});

input.addEventListener("input", () => {
  if (input.value.trim()) {
    error.textContent = "";
  }
});

loadTodos().catch(() => {
  error.textContent = "목록을 불러오지 못했습니다. 다시 열어 주세요.";
});


// ---------- v2: 환율 계산기 ----------
// 기준환율은 은행 고시(매매기준율)가 정답. API 값은 참고용(유럽중앙은행 기준, 하루 1번).
const FX_KEY = "fx";
const FX_API = "https://api.frankfurter.dev/v1/latest?symbols=KRW,USD,JPY";
const FX_UNIT = { USD: 1, JPY: 100, EUR: 1 }; // 엔화는 100엔당 원
const FX_NAMES = {
  USD: /USD|미국|달러/,
  JPY: /JPY|일본|엔화/,
  EUR: /EUR|유로|유럽/,
};

const fxEl = {
  currency: document.querySelector("#fx-currency"),
  unit: document.querySelector("#fx-unit"),
  rate: document.querySelector("#fx-rate"),
  amount: document.querySelector("#fx-amount"),
  spread: document.querySelector("#fx-spread"),
  pref: document.querySelector("#fx-pref"),
  base: document.querySelector("#fx-base"),
  buy: document.querySelector("#fx-buy"),
  sell: document.querySelector("#fx-sell"),
  error: document.querySelector("#fx-error"),
  pasteInput: document.querySelector("#fx-paste-input"),
  pasteButton: document.querySelector("#fx-paste-button"),
  load: document.querySelector("#fx-load"),
  source: document.querySelector("#fx-source"),
};

let fx = {
  currency: "USD",
  rates: { USD: "", JPY: "", EUR: "" },
  amount: "",
  spread: "",
  pref: "",
  source: "",
};

// "1,000,000" "1 000" "1,400.50원" 같은 입력을 숫자로. 비어 있으면 null, 숫자가 아니면 NaN.
function toNumber(text) {
  const cleaned = String(text ?? "").replace(/[,\s원]/g, "");
  if (cleaned === "") return null;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

function won(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function fxCalculate() {
  const unit = FX_UNIT[fx.currency];
  const rate = toNumber(fx.rates[fx.currency]);
  const amount = toNumber(fx.amount);
  const spread = toNumber(fx.spread);
  const pref = toNumber(fx.pref);
  fxEl.base.textContent = "-";
  fxEl.buy.textContent = "-";
  fxEl.sell.textContent = "-";
  fxEl.error.textContent = "";

  if (rate === null || amount === null) return;
  if (Number.isNaN(rate) || Number.isNaN(amount) || Number.isNaN(spread) || Number.isNaN(pref)) {
    fxEl.error.textContent = "숫자로 입력해 주세요. (콤마는 괜찮아요)";
    return;
  }
  if (rate <= 0) {
    fxEl.error.textContent = "기준환율은 0보다 커야 해요.";
    return;
  }
  if (amount <= 0) {
    fxEl.error.textContent = "외화 금액은 0보다 크게 넣어 주세요.";
    return;
  }
  if ((spread !== null && (spread < 0 || spread > 100)) || (pref !== null && (pref < 0 || pref > 100))) {
    fxEl.error.textContent = "스프레드와 우대율은 0~100 사이로 넣어 주세요.";
    return;
  }

  const krw = (amount * rate) / unit;
  fxEl.base.textContent = won(krw);
  if (spread !== null) {
    // 살 때·팔 때 = 기준 ± 기준 × 스프레드 × (1 - 우대율)
    const margin = (spread / 100) * (1 - (pref ?? 0) / 100);
    fxEl.buy.textContent = won(krw * (1 + margin));
    fxEl.sell.textContent = won(krw * (1 - margin));
  }
}

function fxRender() {
  fxEl.currency.value = fx.currency;
  fxEl.unit.textContent = fx.currency === "JPY" ? "(100엔당 원)" : `(1 ${fx.currency}당 원)`;
  fxEl.rate.value = fx.rates[fx.currency] ?? "";
  fxEl.amount.value = fx.amount;
  fxEl.spread.value = fx.spread;
  fxEl.pref.value = fx.pref;
  fxEl.source.textContent = fx.source || "기준환율은 은행 고시가 정답이에요.";
  fxCalculate();
}

async function fxSave() {
  await chrome.storage.local.set({ [FX_KEY]: fx });
}

async function fxLoad() {
  const stored = await chrome.storage.local.get(FX_KEY);
  if (stored[FX_KEY]) fx = { ...fx, ...stored[FX_KEY], rates: { ...fx.rates, ...stored[FX_KEY].rates } };
  fxRender();
}

fxEl.currency.addEventListener("change", () => {
  fx.currency = fxEl.currency.value;
  fxRender();
  fxSave();
});

for (const [name, el] of [["amount", fxEl.amount], ["spread", fxEl.spread], ["pref", fxEl.pref]]) {
  el.addEventListener("input", () => {
    fx[name] = el.value;
    fxCalculate();
    fxSave();
  });
}

fxEl.rate.addEventListener("input", () => {
  fx.rates[fx.currency] = fxEl.rate.value;
  fx.source = "직접 입력한 기준환율";
  fxEl.source.textContent = fx.source;
  fxCalculate();
  fxSave();
});

// 은행 환율표 한 줄에서 매매기준율 찾기.
// 은행표는 "살 때·팔 때"(현찰, 송금)의 딱 가운데 값이 매매기준율이라,
// 다른 두 값의 평균과 (소수 둘째 자리 반올림 오차 안에서) 같은 숫자를 고른다. 그런 짝이 가장 많은 숫자를 쓴다. 못 찾으면 첫 숫자.
function pickBaseRate(numbers) {
  let best = numbers[0];
  let bestPairs = 0;
  for (let k = 0; k < numbers.length; k += 1) {
    let pairs = 0;
    for (let i = 0; i < numbers.length; i += 1) {
      for (let j = i + 1; j < numbers.length; j += 1) {
        if (i === k || j === k || numbers[i] === numbers[j]) continue;
        if (Math.abs((numbers[i] + numbers[j]) / 2 - numbers[k]) <= 0.011) pairs += 1;
      }
    }
    if (pairs > bestPairs) {
      best = numbers[k];
      bestPairs = pairs;
    }
  }
  return best;
}

function parseRateTable(text) {
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const code = Object.keys(FX_NAMES).find((c) => FX_NAMES[c].test(line));
    if (!code || found[code]) continue;
    const withoutUnit = line.replace(/\(?\s*100\s*\)?\s*(엔)?/g, (m) => (/[(엔]/.test(m) ? " " : m));
    const numbers = (withoutUnit.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) || [])
      .map((n) => Number(n.replace(/,/g, "")))
      .filter((n) => n > 1);
    if (numbers.length) found[code] = pickBaseRate(numbers);
  }
  return found;
}

fxEl.pasteButton.addEventListener("click", () => {
  const found = parseRateTable(fxEl.pasteInput.value);
  const codes = Object.keys(found);
  if (!codes.length) {
    fxEl.error.textContent = "통화(USD · JPY · EUR)가 들어 있는 줄을 찾지 못했어요.";
    return;
  }
  for (const code of codes) fx.rates[code] = found[code].toFixed(2);
  fx.source = `붙여 넣은 환율표에서 채움: ${codes.map((c) => `${c} ${Number(fx.rates[c]).toLocaleString("ko-KR")}`).join(" · ")} (값이 맞는지 은행 화면과 확인하세요)`;
  fxRender();
  fxSave();
});

fxEl.load.addEventListener("click", async () => {
  fxEl.load.disabled = true;
  fxEl.load.textContent = "불러오는 중…";
  fxEl.error.textContent = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(FX_API, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json(); // 기준 통화는 EUR: { date, rates: { KRW, USD, JPY } }
    const { KRW, USD, JPY } = data.rates;
    fx.rates = {
      USD: (KRW / USD).toFixed(2),
      JPY: ((KRW / JPY) * 100).toFixed(2),
      EUR: KRW.toFixed(2),
    };
    fx.source = `${data.date} · 유럽중앙은행 기준 (Frankfurter) · 은행 고시와 다름`;
    fxRender();
    await fxSave();
  } catch {
    fxEl.error.textContent = "환율을 가져오지 못했어요. 인터넷 연결을 확인하거나 직접 입력해 주세요.";
  } finally {
    fxEl.load.disabled = false;
    fxEl.load.textContent = "오늘 환율 불러오기";
  }
});

fxLoad().catch(() => {
  fxEl.error.textContent = "환율 정보를 불러오지 못했습니다. 다시 열어 주세요.";
});
