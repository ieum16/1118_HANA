(() => {
  const calculator = document.querySelector(".rate-calculator");
  const fields = document.getElementById("calculator-fields");
  const inputs = [...fields.querySelectorAll("[data-field]")];
  const buttons = [...fields.querySelectorAll("[data-currency]")];
  const bankTable = document.getElementById("bank-rate-table");
  const bankStatus = document.getElementById("bank-rate-status");
  const storageStatus = document.getElementById("calculator-storage-status");
  const outputs = ["base", "buy", "sell"].map(name => document.getElementById("calculator-" + name + "-total"));
  const codes = buttons.map(button => button.dataset.currency);
  const storageKey = code => "rateCalculator." + code;
  const values = Object.fromEntries(codes.map(code => [code, {}]));
  const limits = { rate: Infinity, amount: Infinity, buySpread: 100, sellSpread: 100, preference: 100 };
  const krw = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  let activeCode = "USD";
  let pastedTables = [];

  const units = code => code === "JPY" ? 100 : 1;
  const normalize = text => text.normalize("NFKC").trim();

  function readNumber(text, suffix) {
    const normalized = normalize(text);
    const value = suffix ? normalized.replace(suffix, "").trim() : normalized;
    if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(value)) return NaN;
    const number = Number(value.replaceAll(",", ""));
    return Number.isFinite(number) ? number : NaN;
  }

  function renderTotals() {
    const numbers = {};
    for (const input of inputs) {
      const field = input.dataset.field;
      const raw = input.value.trim();
      const value = readNumber(raw);
      const valid = value >= 0 && value <= limits[field] && (field !== "rate" || value > 0);
      input.setAttribute("aria-invalid", String(raw !== "" && !valid));
      numbers[field] = raw === "" ? null : valid ? value : NaN;
    }

    const { amount, rate, buySpread, sellSpread, preference } = numbers;
    const base = amount === null || rate === null ? NaN : amount / units(activeCode) * rate;
    const feeFactor = (1 - (preference ?? 0) / 100) / 100;
    const effectiveSellSpread = sellSpread ?? buySpread;
    const totals = [
      base,
      buySpread === null ? NaN : base * (1 + buySpread * feeFactor),
      effectiveSellSpread === null ? NaN : base * (1 - effectiveSellSpread * feeFactor),
    ];
    outputs.forEach((output, index) => {
      const total = totals[index];
      output.textContent = Number.isFinite(total) ? krw.format(total) + "원" : "—";
    });
  }

  function showCurrency(code) {
    activeCode = code;
    calculator.classList.toggle("is-usd", code === "USD");
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.currency === code));
    document.getElementById("calculator-unit").textContent = code;
    document.getElementById("calculator-rate-unit").textContent = units(code) + " " + code + "당 원";
    for (const input of inputs) input.value = values[code][input.dataset.field] ?? "";
    renderTotals();
  }

  function setStatus(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  async function saveCurrencies(changedCodes) {
    const changes = Object.fromEntries(changedCodes.map(code => [storageKey(code), { ...values[code] }]));
    try {
      await chrome.storage.local.set(changes);
      setStatus(storageStatus, "");
    } catch {
      setStatus(storageStatus, "입력값을 저장하지 못했어요.");
    }
  }

  function tableRows(table) {
    const rows = [...table.rows];
    const grid = rows.map(() => []);
    for (const [index, row] of rows.entries()) {
      let column = 0;
      for (const cell of row.cells) {
        while (grid[index][column] !== undefined) column += 1;
        const end = Math.min(rows.length, index + (cell.rowSpan || row.parentElement.rows.length - row.sectionRowIndex));
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const pieces = [];
        while (walker.nextNode()) pieces.push(walker.currentNode.textContent.trim());
        const text = pieces.filter(Boolean).join(" ");
        for (let y = index; y < end; y += 1) {
          for (let x = column; x < column + cell.colSpan; x += 1) {
            grid[y][x] = text;
          }
        }
        column += cell.colSpan;
      }
    }
    return grid;
  }

  function textRows(text) {
    return text.split(/\r\n?|\n/).filter(line => line.trim()).map(line => {
      if (line.includes("\t")) return line.split("\t").map(cell => cell.trim());
      if (line.includes("|")) return line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
      const pair = normalize(line).match(/^((?:USD|JPY|EUR)(?:\s*(?:\((?:1|100)\)|100))?)\s+([\d,.]+(?:\s*원)?)$/i);
      return pair ? pair.slice(1) : line.trim().split(/ {2,}/);
    });
  }

  function parseBankRows(rows) {
    const parsed = {};
    let headings = [];
    let hasData = false;
    for (const row of rows) {
      const cells = Array.from(row, cell => normalize(cell ?? ""));
      const firstNumber = cells.findIndex(cell => Number.isFinite(readNumber(cell, /원$/)));
      const label = cells.slice(0, firstNumber < 0 ? cells.length : firstNumber).join(" ");
      const code = label.match(/\b(USD|JPY|EUR)(?=\b|100(?!\d))/i)?.[1].toUpperCase();
      if (!code) {
        if (firstNumber < 0 && cells.some(cell => /기준\s*(?:환율|율)|현찰|살\s*때|사실\s*때|팔\s*때|파실\s*때|스프레드|spread|^환율$/i.test(cell))) {
          if (hasData) headings = [];
          hasData = false;
          headings.push(cells);
        }
        continue;
      }
      if (firstNumber < 0 || parsed[code]) continue;
      hasData = true;

      const columns = cells.map((_, index) => [...new Set(headings.map(header => header[index] ?? ""))].join("").replace(/\s/g, ""));
      const rateColumn = columns.findIndex(column => /^(?:매매기준율|기준환율|기준율|환율)(?:\(원\))?$/.test(column));
      const rowAmounts = cells.slice(firstNumber).filter(Boolean);
      const rate = readNumber(rateColumn >= 0 ? cells[rateColumn] : rowAmounts.length === 1 ? rowAmounts[0] : "", /원$/);
      if (!(rate > 0)) continue;
      const perYen = code === "JPY" && (/\bJPY\s*\(?\s*1(?!\d)|(?<!\d)1\s*엔/.test(label));
      const normalizedRate = perYen ? rate * units(code) : rate;
      if (!Number.isFinite(normalizedRate)) continue;
      const quote = { rate: String(normalizedRate) };

      for (const [field, side] of [["buySpread", /살때|사실때|현찰살|현찰사/], ["sellSpread", /팔때|파실때|현찰팔|현찰파/]]) {
        const isCashSide = column => side.test(column) && !/송금|전신환|수표|T\/C|여행자/i.test(column);
        const spreadColumn = columns.findIndex(column => isCashSide(column) && /스프레드|spread/i.test(column));
        const cashColumn = columns.findIndex(column => isCashSide(column) && !/스프레드|spread/i.test(column));
        const spreadCell = cells[spreadColumn] ?? "";
        const combined = spreadCell.match(/^([\d,.]+(?:\s*원)?)\s*(?:\/\s*|\(\s*|\s+)([\d.]+)\s*%?\s*\)?$/);
        const cashRate = readNumber(cells[cashColumn] ?? combined?.[1] ?? "", /원$/);
        const spread = readNumber(combined?.[2] ?? spreadCell, /%$/);
        const difference = field === "buySpread" ? cashRate - rate : rate - cashRate;
        const derived = cashRate > 0 ? difference / rate * 100 : NaN;
        const result = Number.isFinite(spread) ? spread : derived;
        if (result >= 0 && result <= 100) quote[field] = String(Number(result.toFixed(4)));
      }
      parsed[code] = quote;
    }
    return parsed;
  }

  function applyBankRates(showError = true) {
    const quotes = Object.assign({}, parseBankRows(textRows(bankTable.value)), ...pastedTables.map(parseBankRows));
    const matched = codes.filter(code => quotes[code]);
    if (!matched.length) {
      if (showError) setStatus(bankStatus, "환율을 읽지 못했어요. 매매기준율 열 제목과 통화별 행을 함께 붙여넣어 주세요.");
      return;
    }

    for (const code of matched) {
      const quote = quotes[code];
      Object.assign(values[code], quote);
    }
    showCurrency(activeCode);
    const missing = codes.filter(code => !quotes[code]);
    const message = matched.join(" · ") + " 기준환율을 채웠어요.";
    setStatus(bankStatus, missing.length ? message + " 미인식 " + missing.join(" · ") : message);
    void saveCurrencies(matched);
  }

  for (const input of inputs) {
    input.addEventListener("input", () => {
      values[activeCode][input.dataset.field] = input.value;
      renderTotals();
      void saveCurrencies([activeCode]);
    });
  }
  for (const button of buttons) {
    button.addEventListener("click", () => showCurrency(button.dataset.currency));
  }
  bankTable.addEventListener("input", () => {
    pastedTables = [];
    setStatus(bankStatus, "");
  });
  bankTable.addEventListener("paste", event => {
    if (!event.clipboardData) return;
    const { clipboardData } = event;
    const template = document.createElement("template");
    // Read cells from inert clipboard markup without adding it to the page.
    template.innerHTML = clipboardData.getData("text/html");
    pastedTables = [...template.content.querySelectorAll("table")].map(tableRows);
    const plainText = clipboardData.getData("text/plain");
    if (!plainText && !pastedTables.length) return;
    event.preventDefault();
    bankTable.value = plainText || pastedTables[0].map(row => row.join("\t")).join("\n");
    applyBankRates();
  });
  document.getElementById("apply-bank-rates").addEventListener("click", () => applyBankRates());

  chrome.storage.local.get(codes.map(storageKey)).then(stored => {
    for (const code of codes) Object.assign(values[code], stored[storageKey(code)]);
  }).catch(() => {
    setStatus(storageStatus, "저장된 입력값을 불러오지 못했어요.");
  }).finally(() => {
    showCurrency(activeCode);
    fields.disabled = false;
  });
})();
