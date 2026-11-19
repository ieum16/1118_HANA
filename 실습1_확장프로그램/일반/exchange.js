const defaultHundredUnits = new Set(["JPY", "IDR", "VND", "KHR"]);
const exchangeUnits = [1, 100, 1000];

function exchangeNumber(value) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$|^\.\d+$/.test(text)) return NaN;
  return Number(text.replaceAll(",", ""));
}

function calculateExchange({ amount, rate, unit, buy, sell, discount }) {
  const quantity = exchangeNumber(amount);
  const baseRate = exchangeNumber(rate);
  const buySpread = exchangeNumber(buy.trim() || sell.trim());
  const sellSpread = exchangeNumber(sell.trim() || buy.trim());
  const benefit = exchangeNumber(discount.trim() || "0");
  const base = quantity / Number(unit) * baseRate;
  const validBase = exchangeUnits.includes(Number(unit)) && baseRate > 0 && Number.isFinite(base);
  const validBenefit = benefit >= 0 && benefit <= 100;
  const factor = 1 - benefit / 100;
  const purchase = base * (1 + buySpread / 100 * factor);
  const sale = base * (1 - sellSpread / 100 * factor);
  return {
    base: validBase ? base : null,
    buy: validBase && validBenefit && buySpread >= 0 && buySpread <= 100 ? purchase : null,
    sell: validBase && validBenefit && sellSpread >= 0 && sellSpread <= 100 ? sale : null,
  };
}

function parseExchangeRows(rows, currencies) {
  const rates = new Map();
  let headers = [];
  for (const row of rows) {
    const codeIndex = row.findIndex((cell) =>
      (cell.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? []).some((code) => currencies.has(code)));
    if (codeIndex < 0) {
      if (row.some((cell) => /[가-힣]/.test(cell))) headers.push(row);
      continue;
    }

    const codeCell = row[codeIndex];
    const code = codeCell.toUpperCase().match(/\b[A-Z]{3}\b/g).find((value) => currencies.has(value));
    if (rates.has(code)) continue;

    const names = row.map((_, index) => headers.map((header) => header[index] ?? "").join("").replace(/\s/g, ""));
    const matchingHeader = headers.filter((header) => header.length === row.length).findLast((header) =>
      header.some((cell) => /^(?:매매)?기준환?율(?:\(원\))?$/.test(cell.replace(/\s/g, ""))));
    const rateIndex = matchingHeader
      ? matchingHeader.findIndex((cell) => /^(?:매매)?기준환?율(?:\(원\))?$/.test(cell.replace(/\s/g, "")))
      : row.length === 2 && codeIndex === 0 ? 1 : -1;
    const rate = exchangeNumber(row[rateIndex]);
    if (!Number.isFinite(rate) || rate <= 0) continue;

    const unitText = row.slice(codeIndex, rateIndex).join(" ");
    const unitMatch = unitText.match(/(?:^|[^\d,.])(1,000|1000|100|1)(?=\s*(?:단위|엔|루피아|동|리엘|[)）]|$))/);
    const unit = unitMatch ? exchangeNumber(unitMatch[1]) : defaultHundredUnits.has(code) ? 100 : 1;
    const buyIndex = names.findIndex((name) => /현찰.*(?:사실|살)때/.test(name) && !/스프레드/.test(name));
    const sellIndex = names.findIndex((name) => /현찰.*(?:파실|팔)때/.test(name) && !/스프레드/.test(name));
    const buyRate = exchangeNumber(row[buyIndex]);
    const sellRate = exchangeNumber(row[sellIndex]);
    const spreads = {};
    if (buyRate >= rate && buyRate <= rate * 2) {
      spreads.buy = String(Number(((buyRate - rate) / rate * 100).toFixed(6)));
    }
    if (sellRate > 0 && sellRate <= rate) {
      spreads.sell = String(Number(((rate - sellRate) / rate * 100).toFixed(6)));
    }
    rates.set(code, { rate: String(rate), unit: String(unit), ...spreads });
  }
  return rates;
}

function exchangeTextRows(text) {
  return text.normalize("NFKC").split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
    if (line.includes("|")) return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const simple = line.trim().match(/^([A-Z]{3}(?:\s*\(\s*(?:1|100|1,?000)\s*\))?)[ :]+([\d,.]+)$/i);
    return simple ? simple.slice(1) : line.trim().split(/ {2,}/);
  });
}

function exchangeHtmlTables(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll("table"), (table) => {
    const rows = Array.from(table.rows, () => []);
    Array.from(table.rows).forEach((row, index) => {
      let column = 0;
      for (const cell of row.cells) {
        while (rows[index][column] !== undefined) column++;
        const value = cell.textContent.normalize("NFKC").trim();
        const width = Math.min(cell.colSpan, 50);
        const height = Math.min(cell.rowSpan, rows.length - index);
        for (let y = index; y < index + height; y++) {
          for (let x = column; x < column + width; x++) rows[y][x] = value;
        }
        column += width;
      }
    });
    return rows.map((row) => Array.from(row, (cell) => cell ?? ""));
  });
}

(() => {
  const key = "exchange-calculator";
  const currencies = new Set(Intl.supportedValuesOf("currency").filter((code) => code !== "KRW"));
  const names = new Intl.DisplayNames(["ko"], { type: "currency" });
  const currency = document.querySelector("#fx-currency");
  const amountLabel = document.querySelector("#fx-amount-label");
  const fieldNames = ["amount", "rate", "unit", "buy", "sell", "discount"];
  const fields = Object.fromEntries(fieldNames.map((name) => [name, document.querySelector(`#fx-${name}`)]));
  const results = Object.fromEntries(["base", "buy", "sell"].map((name) => [name, document.querySelector(`#fx-${name}-result`)]));
  const error = document.querySelector("#fx-error");
  const tableInput = document.querySelector("#fx-table");
  const importStatus = document.querySelector("#fx-import-status");
  const won = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
  const preferred = ["USD", "JPY", "EUR", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "TWD", "SGD", "NZD", "THB", "VND", "IDR"];
  let state = { currency: "USD", values: {}, pasted: "" };
  let readFailed = false;

  try {
    const previous = JSON.parse(localStorage.getItem(key));
    if (previous && currencies.has(previous.currency) && previous.values && typeof previous.pasted === "string") {
      state = previous;
    }
  } catch {
    readFailed = true;
  }

  for (const code of new Set([...preferred, ...currencies])) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} · ${names.of(code)}`;
    currency.append(option);
  }

  function showMessage(element, message = "") {
    element.textContent = message;
    element.hidden = !message;
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      return true;
    } catch {
      showMessage(error, "입력값을 저장하지 못했어요.");
      return false;
    }
  }

  function displayResults() {
    const values = Object.fromEntries(fieldNames.map((name) => [name, fields[name].value]));
    const amounts = calculateExchange(values);
    for (const [name, amount] of Object.entries(amounts)) {
      results[name].textContent = Number.isFinite(amount) ? `${won.format(amount)}원` : "—";
    }
    const invalid = fieldNames.some((name) => {
      const text = values[name].trim();
      if (!text || name === "unit") return false;
      const number = exchangeNumber(text);
      const percent = ["buy", "sell", "discount"].includes(name);
      return !Number.isFinite(number) || (name === "rate" && number <= 0) || (percent && number > 100);
    });
    showMessage(error, invalid ? "금액과 환율은 숫자로, 스프레드와 우대율은 0~100으로 입력하세요." : "");
  }

  function displayCurrency() {
    const code = state.currency;
    currency.value = code;
    amountLabel.textContent = `외화 금액 (${code})`;
    const values = state.values[code] ?? {};
    for (const name of fieldNames) {
      fields[name].value = values[name] ?? (name === "unit" ? (defaultHundredUnits.has(code) ? "100" : "1") : "");
    }
    displayResults();
  }

  function applyTable(html = "") {
    const rowSets = html ? exchangeHtmlTables(html) : [];
    rowSets.push(exchangeTextRows(tableInput.value));
    let rates = new Map();
    for (const rows of rowSets) {
      const parsed = parseExchangeRows(rows, currencies);
      if (parsed.size > rates.size) rates = parsed;
    }
    state.pasted = tableInput.value;
    if (!rates.size) {
      save();
      showMessage(importStatus, "환율을 찾지 못했어요. 매매기준율 열 제목과 통화 행을 함께 복사해 주세요.");
      return;
    }

    for (const [code, values] of rates) {
      state.values[code] = { ...state.values[code], ...values };
    }
    if (!rates.has(state.currency)) state.currency = rates.keys().next().value;
    displayCurrency();
    const stored = save();
    showMessage(importStatus, `${rates.size}개 통화의 환율을 ${stored ? "반영했어요." : "반영했지만 저장하지 못했어요."}`);
  }

  currency.addEventListener("change", () => {
    state.currency = currency.value;
    displayCurrency();
    save();
  });
  for (const name of fieldNames) {
    fields[name].addEventListener("input", () => {
      state.values[state.currency] = { ...state.values[state.currency], [name]: fields[name].value };
      displayResults();
      save();
    });
  }
  tableInput.addEventListener("input", () => {
    state.pasted = tableInput.value;
    showMessage(importStatus);
    save();
  });
  tableInput.addEventListener("paste", (event) => {
    if (!event.clipboardData) return;
    const text = event.clipboardData.getData("text/plain");
    const html = event.clipboardData.getData("text/html");
    if (!text && !html) return;
    event.preventDefault();
    tableInput.value = text.slice(0, tableInput.maxLength);
    applyTable(html.length <= 2_000_000 ? html : "");
  });
  document.querySelector("#fx-apply").addEventListener("click", () => applyTable());

  tableInput.value = state.pasted;
  displayCurrency();
  if (readFailed) showMessage(error, "저장한 환율 입력값을 불러오지 못했어요.");
})();
