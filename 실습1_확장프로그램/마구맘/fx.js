(() => {
  const key = "today-todo-fx-v1";
  const codes = Intl.supportedValuesOf("currency").filter(code => code !== "KRW");
  const preferred = ["USD", "JPY", "EUR", "CNY", "HKD", "GBP", "AUD", "CAD", "VND"];
  const names = new Intl.DisplayNames("ko", { type: "currency" });
  const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });
  const fields = ["amount", "rate", "unit", "buySpread", "sellSpread", "discount"];
  const el = name => document.getElementById("fx-" + name);
  const defaultUnit = code => ["JPY", "IDR", "VND", "KHR"].includes(code) ? "100" : "1";

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved && saved.entries) return saved;
    } catch {}
    return { active: "USD", entries: {}, draft: "" };
  }

  let state = load();
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      el("error").textContent = "입력값을 저장할 수 없어요.";
    }
  }

  function number(raw) {
    const text = String(raw ?? "").normalize("NFKC").trim()
      .replace(/^₩\s*/, "").replace(/\s*(?:원|%)$/, "");
    if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const value = Number(text.replaceAll(",", ""));
    return Number.isFinite(value) ? value : null;
  }

  function calculate(entry) {
    const amount = number(entry.amount);
    const rate = number(entry.rate);
    const unit = number(entry.unit);
    const buy = number(entry.buySpread);
    const sell = number(entry.sellSpread);
    const discount = number(entry.discount);
    const invalid = (field, value) => entry[field]?.trim() && value === null;
    const baseValid = !invalid("amount", amount) && !invalid("rate", rate) &&
      !invalid("unit", unit) && rate !== 0 && (unit === null || (unit > 0 && Number.isInteger(unit)));
    const spreadValid = !invalid("buySpread", buy) && !invalid("sellSpread", sell) &&
      !invalid("discount", discount) && (buy ?? 0) <= 100 && (sell ?? 0) <= 100 && (discount ?? 0) <= 100;
    const base = baseValid && amount !== null && rate !== null && unit !== null ? amount / unit * rate : null;
    const factor = (1 - (discount ?? 0) / 100) / 100;
    const hasSpread = buy !== null || sell !== null;
    return {
      base,
      buy: base !== null && spreadValid && hasSpread ? base * (1 + (buy ?? sell) * factor) : null,
      sell: base !== null && spreadValid && hasSpread ? base * (1 - (sell ?? buy) * factor) : null,
      error: !baseValid ? "금액은 0 이상, 기준율은 0보다 크게, 고시 단위는 양의 정수로 입력해 주세요." :
        !spreadValid ? "스프레드와 우대율은 0~100%로 입력해 주세요." : ""
    };
  }

  function current() {
    return { unit: defaultUnit(state.active), ...state.entries[state.active] };
  }

  function renderAmounts() {
    const result = calculate(current());
    for (const name of ["base", "buy", "sell"]) {
      el(name).textContent = Number.isFinite(result[name]) ? won.format(result[name]) : "—";
    }
    el("error").textContent = result.error;
  }

  function renderCurrency() {
    const options = [...new Set([...Object.keys(state.entries), ...preferred, ...codes, state.active])];
    el("currency").replaceChildren(...options.map(code => {
      const name = names.of(code);
      return new Option(name === code ? code : code + " · " + name, code);
    }));
    el("currency").value = state.active;
    const entry = current();
    for (const field of fields) el(field).value = entry[field] ?? "";
    renderAmounts();
  }

  function currencyOf(cell) {
    const code = String(cell ?? "").toUpperCase().match(/(?:^|[^A-Z])([A-Z]{3})(?=$|[^A-Z])/);
    return code && code[1] !== "KRW" && (codes.includes(code[1]) || /^[A-Z]{3}$/.test(cell.trim()))
      ? code[1] : "";
  }

  function parseRows(rows) {
    const result = new Map();
    let positions;
    for (const original of rows) {
      let row = original.map(cell => cell.trim());
      const headers = row.map(cell => cell.toLowerCase().replace(/\s/g, ""));
      const codeAt = headers.findIndex(cell => /통화(코드|표시|명)?$|^currency(code)?$|^ccy$/.test(cell));
      const marketAt = headers.findIndex(cell => /매매기준(율|환율)|^base(rate)?$|^mid(rate)?$/.test(cell));
      const baseAt = marketAt >= 0 ? marketAt : headers.findIndex(cell => /기준환율|^기준율$/.test(cell));
      if (codeAt >= 0 && baseAt >= 0) {
        const side = (direction, spread) => {
          const matches = cell => direction.test(cell) && !/송금|t\/c/.test(cell);
          const index = headers.findIndex(cell => matches(cell) &&
            (spread ? /스프레드(율)?$|spread$/.test(cell) : !/스프레드(율)?$|spread$/.test(cell)));
          return index;
        };
        const buy = /(?:사(?:실|는)?|살)때|외화사기|^buy/;
        const sell = /(?:파(?:실|는)?|팔)때|외화팔기|^sell/;
        positions = {
          code: codeAt, width: row.length, base: baseAt,
          unit: headers.findIndex(cell => /고시단위|^단위$|^unit$/.test(cell)),
          buy: side(buy, false), sell: side(sell, false),
          buySpread: side(buy, true), sellSpread: side(sell, true),
          namedSpreads: headers.filter(cell => /스프레드|spread/.test(cell)).length
        };
        continue;
      }

      let pos = positions;
      if (!pos && row.length === 2) pos = { code: 0, base: 1, width: 2 };
      if (!pos) continue;
      const code = currencyOf(row[pos.code]);
      if (!code) continue;
      // Some banks show each cash spread in a separate cell under the cash-rate heading.
      if (row.length > pos.width && pos.namedSpreads && row.some(cell => /^\d+(?:\.\d+)?%$/.test(cell))) {
        const withoutInlinePercents = row.filter(cell => !/^\d+(?:\.\d+)?%$/.test(cell));
        if (withoutInlinePercents.length === pos.width) row = withoutInlinePercents;
      }
      if (row.length !== pos.width) continue;
      const rate = number(row[pos.base]);
      if (!rate || row[pos.base].includes("%")) continue;

      const explicitUnit = number(row[pos.unit]);
      const mentionedUnit = row.slice(0, pos.base).find(cell => /(?:^|\s)100\s*(?:단위|[엔동루피리엘])/.test(cell));
      const unit = Number.isInteger(explicitUnit) && explicitUnit > 0 ? String(explicitUnit) :
        mentionedUnit ? "100" : defaultUnit(code);
      const entry = { rate: String(rate), unit };
      for (const direction of ["buy", "sell"]) {
        const spreadName = direction + "Spread";
        const direct = number(row[pos[spreadName]]);
        const cash = number(row[pos[direction]]);
        const inferred = cash > 0 ? (direction === "buy" ? cash - rate : rate - cash) / rate * 100 : null;
        const spread = direct ?? inferred;
        if (spread !== null && spread >= 0 && spread <= 100) entry[spreadName] = String(Number(spread.toFixed(6)));
      }
      if (!result.has(code)) result.set(code, entry);
    }
    return result;
  }

  function textRows(text) {
    return text.split(/\r?\n/).map(line => {
      if (line.includes("\t")) return line.split("\t");
      if (line.includes("|")) return line.replace(/^\s*\||\|\s*$/g, "").split("|");
      if (/\s{2,}/.test(line.trim())) return line.trim().split(/\s{2,}/);
      if (/^[A-Z]{3}\s+[\d,.]+$/i.test(line.trim())) return line.trim().split(/\s+/);
      if (line.includes(",")) {
        return (line.match(/"(?:[^"]|"")*"|[^,]+|(?<=,)(?=,|$)/g) || [])
          .map(cell => cell.replace(/^"|"$/g, "").replaceAll('""', '"'));
      }
      return [line];
    });
  }

  function htmlRows(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const table = template.content.querySelector("table");
    if (!table) return [];
    const grid = [];
    const head = [];
    for (const [index, row] of [...table.rows].slice(0, 250).entries()) {
      grid[index] ??= [];
      head[index] = row.parentElement.tagName === "THEAD" ||
        [...row.cells].every(cell => cell.tagName === "TH");
      let column = 0;
      for (const cell of row.cells) {
        while (grid[index][column] !== undefined) column++;
        for (let down = 0; down < Math.min(cell.rowSpan || 1, 10); down++) {
          grid[index + down] ??= [];
          for (let across = 0; across < Math.min(cell.colSpan, 40); across++) {
            grid[index + down][column + across] = cell.textContent.trim();
          }
        }
      }
    }
    const headerRows = grid.filter((_, index) => head[index]);
    const bodyRows = grid.filter((_, index) => !head[index]);
    if (!headerRows.length) return bodyRows;
    const width = Math.max(...headerRows.map(row => row.length));
    const headers = Array.from({ length: width }, (_, index) => {
      return [...new Set(headerRows.map(row => row[index]).filter(Boolean))].join(" ");
    });
    return [headers, ...bodyRows];
  }

  function applyImport(entries) {
    const status = el("import-status");
    if (!entries.size) {
      status.textContent = "환율을 읽지 못했어요. 통화 코드와 매매기준율 열 제목을 포함해 다시 붙여넣어 주세요.";
      return;
    }
    state = load();
    for (const [code, entry] of entries) state.entries[code] = { ...state.entries[code], ...entry };
    if (!entries.has(state.active)) state.active = entries.keys().next().value;
    state.draft = el("table").value;
    renderCurrency();
    save();
    status.textContent = entries.size + "개 통화의 환율을 채웠어요. 통화 메뉴에서 확인할 수 있어요.";
  }

  el("currency").addEventListener("change", event => {
    state = load();
    state.active = event.target.value;
    renderCurrency();
    save();
  });

  for (const field of fields) {
    el(field).addEventListener("input", event => {
      const active = el("currency").value;
      state = load();
      state.active = active;
      state.entries[active] = { ...state.entries[active], [field]: event.target.value };
      renderAmounts();
      save();
    });
  }

  const table = el("table");
  table.value = state.draft;
  table.addEventListener("input", () => {
    state = load();
    state.draft = table.value;
    save();
  });
  table.addEventListener("paste", event => {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) return;
    const rich = html && html.length <= 500000 ? parseRows(htmlRows(html)) : new Map();
    const entries = rich.size ? rich : parseRows(textRows(text.slice(0, table.maxLength)));
    event.preventDefault();
    if (rich.size) {
      const rows = [...rich].map(([code, entry]) =>
        [code, entry.rate, entry.unit, entry.buySpread ?? "", entry.sellSpread ?? ""].join("\t"));
      table.value = ["통화\t매매기준율\t고시 단위\t살 때 스프레드\t팔 때 스프레드", ...rows].join("\n");
    } else {
      table.value = text.slice(0, table.maxLength);
    }
    if (!entries.size) {
      state = load();
      state.draft = table.value;
      save();
    }
    applyImport(entries);
  });
  el("import").addEventListener("click", () => applyImport(parseRows(textRows(table.value))));
  window.addEventListener("storage", event => {
    if (event.key !== key || document.activeElement?.closest(".fx")) return;
    state = load();
    table.value = state.draft;
    renderCurrency();
  });
  renderCurrency();
})();
