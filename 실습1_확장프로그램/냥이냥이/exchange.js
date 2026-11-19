"use strict";

(() => {
  const prefix = "exchange-v1.";
  const lookup = name => document.getElementById(`exchange-${name}`);
  const currency = lookup("currency");
  const table = lookup("table");
  const fetchButton = lookup("fetch");
  const fetchStatus = lookup("fetch-status");
  const currencyNames = new Intl.DisplayNames(["ko"], { type: "currency" });
  const currencies = new Set(Intl.supportedValuesOf("currency").filter(code => code !== "KRW"));
  const major = ["USD", "JPY", "EUR", "CNY", "GBP"];
  const hundredUnits = new Set(["JPY", "IDR", "VND"]);
  const numberFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
  const rateFormat = new Intl.NumberFormat("en-US", { useGrouping: false, maximumSignificantDigits: 15 });
  const lookupDateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
  const fields = ["amount", "rate", "unit", "spread", "discount"];
  const inputs = Object.fromEntries(fields.map(field => [field, lookup(field)]));
  const storeKey = (code, field) => `${prefix}${code}.${field}`;
  let saved = {};
  let writeVersion = 0;
  let pendingRate;

  currency.replaceChildren(...[...major, ...[...currencies].filter(code => !major.includes(code))]
    .map(code => new Option(`${code} · ${currencyNames.of(code)}`, code)));

  function decimal(text) {
    const value = text.trim();
    if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(value)) return NaN;
    const result = Number(value.replaceAll(",", ""));
    return Number.isFinite(result) ? result : NaN;
  }

  function defaultUnit(code) {
    return hundredUnits.has(code) ? "100" : "1";
  }

  function render() {
    const { amount, rate, unit, spread, discount } = Object.fromEntries(
      fields.map(field => [field, decimal(inputs[field].value)])
    );
    const validUnit = Number.isSafeInteger(unit) && unit > 0;
    lookup("unit-label").textContent = `${validUnit ? unit : "…"} ${currency.value}`;

    const valid = {
      amount: amount >= 0, rate: rate > 0, unit: validUnit,
      spread: spread >= 0 && spread <= 100, discount: discount >= 0 && discount <= 100,
    };
    const errors = {
      amount: "외화 금액은 0 이상의 숫자로 입력하세요.",
      rate: "기준환율은 0보다 큰 숫자로 입력하세요.",
      unit: "환율 기준 단위는 1 이상의 정수로 입력하세요.",
      spread: "스프레드는 0~100%로 입력하세요.",
      discount: "우대율은 0~100%로 입력하세요.",
    };
    let error = "";
    for (const field of fields) {
      const invalid = !valid[field] && Boolean(inputs[field].value.trim());
      inputs[field].setAttribute("aria-invalid", String(invalid));
      if (invalid && !error) error = errors[field];
    }
    lookup("error").textContent = error;

    const base = valid.amount && valid.rate && valid.unit ? (amount / unit) * rate : NaN;
    const preference = inputs.discount.value.trim() ? discount / 100 : 0;
    const margin = valid.spread && (valid.discount || !inputs.discount.value.trim())
      ? (spread / 100) * (1 - preference)
      : NaN;
    const results = { base, buy: base * (1 + margin), sell: base * (1 - margin) };
    for (const [name, value] of Object.entries(results)) {
      lookup(name).textContent = Number.isFinite(value) ? `${numberFormat.format(value)}원` : "—";
    }
  }

  function showCurrency() {
    for (const field of fields) {
      const value = saved[storeKey(currency.value, field)];
      inputs[field].value = typeof value === "string" ? value : field === "unit" ? defaultUnit(currency.value) : "";
    }
    showReference();
    render();
  }

  function showReference() {
    const reference = saved[storeKey(currency.value, "reference")];
    lookup("reference").textContent = reference
      ? `기준일 ${reference.date} · 조회일 ${reference.fetchedDate}\n유럽중앙은행 기준 · 은행 고시와 다름`
      : "";
  }

  function resetRateRequest() {
    const request = pendingRate;
    pendingRate = undefined;
    request?.abort();
    fetchButton.disabled = false;
    fetchButton.textContent = "오늘 환율 불러오기";
    fetchStatus.textContent = "";
  }

  async function fetchRate() {
    const code = currency.value;
    const request = new AbortController();
    pendingRate = request;
    fetchButton.disabled = true;
    fetchButton.textContent = "환율 불러오는 중…";
    fetchStatus.textContent = "";
    const timeout = setTimeout(() => request.abort(), 10000);

    try {
      const url = `https://api.frankfurter.dev/v2/rate/${code}/KRW?providers=ecb`;
      const response = await fetch(url, { signal: request.signal, credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("Rate request failed");
      const { base, quote, rate, date } = await response.json();
      if (base !== code || quote !== "KRW" || !Number.isFinite(rate) || rate <= 0 ||
          typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error("Invalid rate response");
      }
      if (pendingRate !== request) return;

      // The API quotes one foreign currency unit. Keep the calculator's selected unit.
      const enteredUnit = decimal(inputs.unit.value);
      const unit = Number.isSafeInteger(enteredUnit) && enteredUnit > 0 && enteredUnit <= 99999999
        ? inputs.unit.value
        : defaultUnit(code);
      const quotedRate = rate * decimal(unit);
      if (!Number.isFinite(quotedRate) || quotedRate <= 0) throw new Error("Invalid quoted rate");
      save({
        [storeKey(code, "rate")]: rateFormat.format(quotedRate),
        [storeKey(code, "unit")]: unit,
        [storeKey(code, "reference")]: { date, fetchedDate: lookupDateFormat.format(new Date()) },
      });
      showCurrency();
    } catch {
      if (pendingRate === request) fetchStatus.textContent = "환율을 가져오지 못했어요";
    } finally {
      clearTimeout(timeout);
      if (pendingRate === request) {
        pendingRate = undefined;
        fetchButton.disabled = false;
        fetchButton.textContent = "오늘 환율 불러오기";
      }
    }
  }

  async function save(patch) {
    Object.assign(saved, patch);
    const version = ++writeVersion;
    try {
      await chrome.storage.local.set(patch);
      if (version === writeVersion) lookup("save-status").textContent = "";
    } catch {
      lookup("save-status").textContent = "환율 계산기 입력값을 저장하지 못했어요.";
    }
  }

  function currencyCode(text) {
    return (text.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).find(code => currencies.has(code));
  }

  function rateText(text) {
    return text.trim().replace(/^₩\s*/, "").replace(/\s*원$/, "");
  }

  function quotedUnit(label, code, unitCell = "") {
    const explicit = unitCell.trim() || label.match(/(?:\(|\s)([1-9]\d{0,7})\s*(?:[가-힣A-Z]+|\))/i)?.[1];
    return /^[1-9]\d{0,7}$/.test(explicit || "") ? explicit : defaultUnit(code);
  }

  function readRows(rows, plainText = false) {
    const normalized = text => text.replace(/\s/g, "").toLowerCase();
    const rateHeader = /^(?:매매기준율|기준환율|매매기준환율|base(?:exchange)?rate)(?:\(원\))?$/;
    const unitHeader = /^(?:단위|기준단위|환율기준단위|unit)$/;
    const rates = new Map();
    let header;
    let rateColumn = -1;

    for (const row of rows) {
      const baseColumn = row.findIndex(cell => rateHeader.test(normalized(cell)));
      if (baseColumn >= 0) {
        header = row;
        rateColumn = baseColumn;
        continue;
      }

      const codeColumn = row.findIndex(cell => currencyCode(cell));
      if (codeColumn < 0) continue;
      const code = currencyCode(row[codeColumn]);
      const unitColumn = header?.findIndex(cell => unitHeader.test(normalized(cell))) ?? -1;
      let rateCell = rateColumn;
      if (header) {
        // Plain text can lose the column spans of grouped headings.
        const groupedBeforeRate = header.slice(0, rateColumn).some(cell =>
          /^(?:현찰(?:환율)?|송금(?:\(전신환\))?|여행자수표)$/.test(normalized(cell))
        );
        if (plainText && groupedBeforeRate && row.length !== header.length) continue;
        // Some text copies split a single currency heading into a code and a name.
        const currencyColumns = header.slice(0, rateColumn).filter(cell => /통화|currency/i.test(cell)).length;
        if (currencyColumns === 1 && rateColumn === codeColumn + 1 &&
            row[rateColumn] && /[가-힣a-z]/i.test(row[rateColumn]) && !Number.isFinite(decimal(rateText(row[rateColumn])))) {
          rateCell += 1;
        }
      } else if (row.length === 2 && codeColumn === 0) {
        rateCell = 1;
      }
      if (rateCell <= codeColumn || rateCell >= row.length) continue;

      const rate = rateText(row[rateCell]);
      if (!(decimal(rate) > 0)) continue;
      const actualUnitColumn = unitColumn > rateColumn ? unitColumn + rateCell - rateColumn : unitColumn;
      const label = row.slice(codeColumn, rateCell).join(" ");
      if (!rates.has(code)) rates.set(code, { rate, unit: quotedUnit(label, code, row[actualUnitColumn]) });
    }
    return rates;
  }

  function parseText(text) {
    return readRows(text.normalize("NFKC").split(/\r?\n/).map(line => {
      if (line.includes("\t")) return line.split("\t").map(cell => cell.trim());
      if (line.includes("|")) return line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
      const cells = line.trim().split(/\s{2,}/);
      if (cells.length > 1) return cells;
      const simple = line.trim().match(/^([A-Z]{3}(?:\s*\([^)]+\))?)\s+([\d.,]+)$/i);
      return simple ? simple.slice(1) : cells;
    }), true);
  }

  function parseHtml(html) {
    if (!html || html.length > 250000) return new Map();
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const bankTable of template.content.querySelectorAll("table")) {
      const rows = Array.from({ length: Math.min(bankTable.rows.length, 250) }, () => []);
      for (const [index, row] of rows.entries()) {
        let column = 0;
        for (const cell of bankTable.rows[index].cells) {
          while (row[column] !== undefined) column++;
          const width = Math.min(cell.colSpan, 40);
          const height = Math.min(cell.rowSpan || 1, rows.length - index);
          const content = cell.textContent.normalize("NFKC").trim();
          for (let offset = 0; offset < height; offset++) {
            for (let x = column; x < column + width; x++) rows[index + offset][x] = content;
          }
          column += width;
        }
      }
      const rates = readRows(rows.map(row => Array.from(row, value => value ?? "")));
      if (rates.size) return rates;
    }
    return new Map();
  }

  function applyRates(rates) {
    const status = lookup("import-status");
    if (!rates.size) {
      status.textContent = "환율을 찾지 못했어요. 통화 코드와 매매기준율 열을 확인해 주세요.";
      return;
    }
    resetRateRequest();
    const patch = { [`${prefix}table`]: table.value };
    for (const [code, { rate, unit }] of rates) {
      patch[storeKey(code, "rate")] = rate;
      patch[storeKey(code, "unit")] = unit;
      patch[storeKey(code, "reference")] = null;
    }
    if (!rates.has(currency.value)) currency.value = rates.keys().next().value;
    patch[`${prefix}currency`] = currency.value;
    save(patch);
    showCurrency();
    status.textContent = `${rates.size}개 통화의 기준환율을 적용했어요.`;
  }

  currency.addEventListener("change", () => {
    resetRateRequest();
    save({ [`${prefix}currency`]: currency.value });
    showCurrency();
  });
  for (const [field, input] of Object.entries(inputs)) {
    input.addEventListener("input", () => {
      const code = currency.value;
      const patch = { [storeKey(code, field)]: input.value };
      if (field === "rate" || field === "unit") {
        resetRateRequest();
        patch[storeKey(code, "reference")] = null;
      }
      save(patch);
      showReference();
      render();
    });
  }
  fetchButton.addEventListener("click", fetchRate);
  table.addEventListener("input", () => {
    lookup("import-status").textContent = "";
    save({ [`${prefix}table`]: table.value });
  });
  table.addEventListener("paste", event => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    const start = table.selectionStart;
    const end = table.selectionEnd;
    const rates = start === 0 && end === table.value.length ? parseHtml(clipboard.getData("text/html")) : new Map();
    const text = rates.size
      ? ["통화\t매매기준율\t단위", ...Array.from(rates, ([code, { rate, unit }]) => `${code}\t${rate}\t${unit}`)].join("\n")
      : clipboard.getData("text/plain");
    const capacity = table.maxLength - table.value.length + end - start;
    table.setRangeText(text.slice(0, capacity), start, end, "end");
    const imported = rates.size ? rates : parseText(table.value);
    if (!imported.size) save({ [`${prefix}table`]: table.value });
    applyRates(imported);
  });
  lookup("apply").addEventListener("click", () => applyRates(parseText(table.value)));

  async function init() {
    try {
      const storedFields = [...fields, "reference"];
      const keys = [...currencies].flatMap(code => storedFields.map(field => storeKey(code, field)));
      saved = await chrome.storage.local.get([`${prefix}currency`, `${prefix}table`, ...keys]);
      const code = saved[`${prefix}currency`];
      currency.value = currencies.has(code) ? code : "USD";
      table.value = saved[`${prefix}table`] || "";
      lookup("fields").disabled = false;
    } catch {
      lookup("save-status").textContent = "환율 계산기 입력값을 불러오지 못했어요. 창을 다시 열어 주세요.";
    }
    showCurrency();
  }

  init();
})();
