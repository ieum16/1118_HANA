"use strict";

(() => {
  const core = globalThis.FxCore;
  const ids = ["fx-fields", "fx-currency", "fx-base", "fx-unit", "fx-amount", "fx-buy-spread", "fx-sell-spread", "fx-preference", "fx-unit-note", "fx-result", "fx-base-result", "fx-buy-result", "fx-sell-result", "fx-rate-note", "fx-error", "fx-save-status", "fx-table", "fx-preview-button", "fx-apply-button", "fx-preview", "fx-import-status", "fx-save-button", "fx-fetch-button", "fx-fetch-status", "fx-source"];
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const fields = { base: "fx-base", unit: "fx-unit", buySpread: "fx-buy-spread", sellSpread: "fx-sell-spread", preference: "fx-preference" };
  let state = { currency: "JPY", amount: "", table: "", rates: {} };
  let ready = false, preview = [], writeQueue = Promise.resolve(), revision = 0;
  let fetching = false;
  const apiUrl = "https://api.frankfurter.dev/v2/providers/ecb/rate/JPY/KRW";
  const won = value => `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value)}원`;
  const rate = value => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(value);
  const current = () => state.rates[state.currency] || core.defaults(state.currency);

  function sourceInfo() {
    const record = current();
    if (record.source === "ecb" && record.rateDate && record.fetchedAt) {
      const fetched = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(record.fetchedAt));
      ui["fx-source"].textContent = `환율 기준일 ${record.rateDate} · 불러온 날짜 ${fetched} · 유럽중앙은행 기준 · 은행 고시와 다름`;
    } else {
      ui["fx-source"].textContent = "직접 입력하거나 은행 표에서 가져온 기준환율이에요.";
    }
  }

  function save() {
    const snapshot = structuredClone(state), thisRevision = ++revision;
    ui["fx-save-status"].textContent = "입력값 저장 중…";
    // Serialize writes so a slow earlier write cannot overwrite newer input.
    writeQueue = writeQueue.catch(() => {}).then(() => chrome.storage.local.set({ fxCalculator: snapshot })).then(() => {
      if (thisRevision === revision) ui["fx-save-status"].textContent = "입력값이 자동 저장됐어요.";
    }).catch(() => {
      if (thisRevision === revision) ui["fx-save-status"].textContent = "저장하지 못했어요. ‘다시 저장’을 눌러 주세요.";
    });
    return writeQueue;
  }
  function results() {
    const record = current();
    ui["fx-unit-note"].textContent = `${record.unit} ${state.currency}당 원화 기준환율이에요.`;
    ui["fx-error"].textContent = "";
    ui["fx-result"].hidden = true;
    if (!state.amount.trim() || !record.base.trim()) return;
    try {
      const result = core.calculate(state.amount, record);
      ui["fx-base-result"].textContent = won(result.base);
      ui["fx-buy-result"].textContent = won(result.buy);
      ui["fx-sell-result"].textContent = won(result.sell);
      ui["fx-rate-note"].textContent = `${record.unit} ${state.currency} 기준 · 살 때 ${rate(result.buyRate)}원 / 팔 때 ${rate(result.sellRate)}원`;
      ui["fx-result"].hidden = false;
    } catch (error) { ui["fx-error"].textContent = error.message; }
  }
  function fill() {
    ui["fx-currency"].value = state.currency;
    ui["fx-amount"].value = state.amount;
    for (const [key, id] of Object.entries(fields)) ui[id].value = current()[key];
    results(); sourceInfo();
  }
  function capture() {
    if (!ready) return;
    const record = { ...current() };
    if (record.base !== ui["fx-base"].value || record.unit !== ui["fx-unit"].value) {
      delete record.source; delete record.rateDate; delete record.fetchedAt;
      ui["fx-fetch-status"].textContent = "";
    }
    for (const [key, id] of Object.entries(fields)) record[key] = ui[id].value;
    state.rates[state.currency] = record;
    state.amount = ui["fx-amount"].value;
    results(); sourceInfo(); save();
  }
  for (const [code, [name]] of Object.entries(core.currencies)) {
    const option = document.createElement("option");
    option.value = code; option.textContent = `${code} · ${name}`;
    ui["fx-currency"].append(option);
  }
  for (const id of [...Object.values(fields), "fx-amount"]) ui[id].addEventListener("input", capture);
  ui["fx-currency"].addEventListener("change", () => {
    if (!ready) return;
    state.currency = ui["fx-currency"].value; fill(); save();
  });
  ui["fx-save-button"].addEventListener("click", () => { if (ready) save(); });
  ui["fx-fetch-button"].addEventListener("click", async () => {
    if (!ready || fetching) return;
    fetching = true;
    ui["fx-fields"].disabled = true;
    ui["fx-fetch-button"].disabled = true;
    ui["fx-fetch-button"].textContent = "불러오는 중…";
    ui["fx-fetch-status"].classList.toggle("fx-error", false);
    ui["fx-fetch-status"].textContent = "JPY 환율을 불러오는 중이에요.";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(apiUrl, { signal: controller.signal, cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("HTTP error");
      const data = await response.json();
      if (!data || data.base !== "JPY" || data.quote !== "KRW" || typeof data.rate !== "number" ||
        !Number.isFinite(data.rate) || data.rate <= 0 || data.rate > Number.MAX_SAFE_INTEGER / 100 ||
        typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) {
        throw new Error("Invalid exchange rate");
      }
      state.rates.JPY = {
        ...core.defaults("JPY"), ...state.rates.JPY,
        base: String(Number((data.rate * 100).toFixed(4))), unit: "100",
        source: "ecb", rateDate: data.date, fetchedAt: new Date().toISOString()
      };
      state.currency = "JPY";
      fill();
      ui["fx-fetch-status"].textContent = "100엔당 기준환율을 채웠어요. 최신 발표일의 환율이에요.";
      await save();
    } catch {
      ui["fx-fetch-status"].classList.toggle("fx-error", true);
      ui["fx-fetch-status"].textContent = "환율을 가져오지 못했어요";
    } finally {
      clearTimeout(timer);
      fetching = false;
      ui["fx-fields"].disabled = false;
      ui["fx-fetch-button"].disabled = false;
      ui["fx-fetch-button"].textContent = "오늘 환율 불러오기";
    }
  });
  // Preserve merged bank-table column headings when the clipboard has HTML.
  ui["fx-table"].addEventListener("paste", event => {
    const html = event.clipboardData?.getData("text/html");
    if (!html || !ready) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const table of doc.querySelectorAll("table")) {
      const grid = [];
      for (const [rowIndex, row] of Array.from(table.rows).entries()) {
        grid[rowIndex] ||= [];
        let column = 0;
        for (const cell of row.cells) {
          while (grid[rowIndex][column] !== undefined) column++;
          const text = cell.textContent.replace(/\s+/g, " ").trim();
          const rowSpan = Math.min(cell.rowSpan || 1, 20), colSpan = Math.min(cell.colSpan || 1, 30);
          for (let r = 0; r < rowSpan; r++) {
            grid[rowIndex + r] ||= [];
            for (let c = 0; c < colSpan; c++) grid[rowIndex + r][column + c] = text;
          }
          column += colSpan;
        }
      }
      const firstData = grid.findIndex(row => row.some(cell => /\b[A-Z]{3}\b/.test(cell) &&
        Object.keys(core.currencies).some(code => new RegExp(`\\b${code}\\b`).test(cell))));
      if (firstData < 1) continue;
      const headerRows = grid.slice(0, firstData);
      const width = grid[firstData].length;
      const headings = Array.from({ length: width }, (_, column) => {
        const parts = [...new Set(headerRows.map(row => row[column] || ""))];
        const joined = parts.join(" ").replace(/\s/g, "");
        if (/매매기준|기준환율|기준율/.test(joined)) return "매매기준율";
        if (/현찰/.test(joined) && /사실때|살때/.test(joined)) return "현찰 사실 때";
        if (/현찰/.test(joined) && /파실때|팔때/.test(joined)) return "현찰 파실 때";
        return parts.filter(Boolean).join(" ");
      });
      if (headings.filter(label => label === "매매기준율").length !== 1) continue;
      const normalized = [headings, ...grid.slice(firstData)].map(row =>
        Array.from({ length: width }, (_, column) => row[column] || "").join("\t")).join("\n");
      if (normalized.length > 50000) return;
      event.preventDefault();
      ui["fx-table"].value = normalized;
      ui["fx-table"].dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
  });
  ui["fx-table"].addEventListener("input", () => {
    if (!ready) return;
    state.table = ui["fx-table"].value;
    preview = []; ui["fx-preview"].replaceChildren(); ui["fx-apply-button"].disabled = true;
    ui["fx-import-status"].textContent = "‘표 읽기’를 눌러 확인해 주세요.";
    save();
  });
  ui["fx-preview-button"].addEventListener("click", () => {
    ui["fx-preview"].replaceChildren(); preview = []; ui["fx-apply-button"].disabled = true;
    try {
      const parsed = core.parseTable(ui["fx-table"].value);
      preview = parsed.rows;
      for (const row of preview) {
        const item = document.createElement("li");
        item.textContent = `${row.code} · ${row.unit}단위당 ${rate(Number(row.base))}원`;
        if (row.buySpread !== undefined) item.textContent += ` · 살 때 ${rate(Number(row.buySpread))}%`;
        if (row.sellSpread !== undefined) item.textContent += ` · 팔 때 ${rate(Number(row.sellSpread))}%`;
        ui["fx-preview"].append(item);
      }
      ui["fx-import-status"].textContent = preview.length
        ? `${preview.length}개 통화를 찾았어요. 단위와 금액을 확인한 뒤 적용해 주세요.${parsed.warnings.length ? " " + parsed.warnings.join(" ") : ""}`
        : "환율을 찾지 못했어요. 통화코드와 매매기준율 열을 함께 복사하거나, ‘JPY 900’처럼 한 줄에 하나씩 입력해 주세요.";
      ui["fx-apply-button"].disabled = preview.length === 0;
    } catch (error) { ui["fx-import-status"].textContent = error.message; }
  });
  ui["fx-apply-button"].addEventListener("click", () => {
    if (!ready || !preview.length) return;
    for (const { code, ...record } of preview) {
      state.rates[code] = { ...core.defaults(code), ...state.rates[code], ...record };
      delete state.rates[code].source;
      delete state.rates[code].rateDate;
      delete state.rates[code].fetchedAt;
    }
    if (!preview.some(row => row.code === state.currency)) state.currency = preview[0].code;
    fill(); save();
    ui["fx-import-status"].textContent = `${preview.length}개 통화에 적용했어요. 통화를 선택해 확인해 보세요.`;
    preview = []; ui["fx-apply-button"].disabled = true;
  });

  async function initializeFx() {
    try {
      const saved = await chrome.storage.local.get("fxCalculator");
      const data = saved.fxCalculator;
      if (data !== undefined) {
        if (!data || !Object.hasOwn(core.currencies, data.currency) || typeof data.amount !== "string" ||
          typeof data.table !== "string" || !data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) throw new Error("Invalid saved data");
        const rates = {};
        for (const [code, record] of Object.entries(data.rates)) {
          if (!Object.hasOwn(core.currencies, code) || !record || Object.keys(fields).some(key => typeof record[key] !== "string")) throw new Error("Invalid saved rate");
          rates[code] = { ...core.defaults(code), ...record };
          if (record.source !== "ecb" || typeof record.rateDate !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(record.rateDate) || typeof record.fetchedAt !== "string" ||
            !Number.isFinite(Date.parse(record.fetchedAt))) {
            delete rates[code].source; delete rates[code].rateDate; delete rates[code].fetchedAt;
          }
        }
        state = { currency: data.currency, amount: data.amount, table: data.table, rates };
      }
      ui["fx-table"].value = state.table;
      fill(); ready = true; ui["fx-fields"].disabled = false;
      ui["fx-save-status"].textContent = "입력값은 자동으로 저장돼요.";
    } catch {
      ui["fx-save-status"].textContent = "저장값을 불러오지 못했어요. 창을 다시 열어 주세요.";
      document.getElementById("fx-load-error").textContent = "환율 입력값을 불러오지 못했어요. 창을 다시 열어 주세요.";
    }
  }
  initializeFx();
})();
