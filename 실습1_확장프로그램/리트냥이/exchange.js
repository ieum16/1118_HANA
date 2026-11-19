"use strict";

(() => {
  const panel = document.querySelector("#exchange");
  const won = document.querySelector("#won");
  const foreign = document.querySelector("#foreign-amount");
  const foreignLabel = document.querySelector("#fx-label");
  let source = won;
  const currency = document.querySelector("#currency");
  const quote = document.querySelector("#quote");
  const result = document.querySelector("#converted");
  const basis = document.querySelector("#basis");
  const status = document.querySelector("#fx-status");
  const reload = document.querySelector("#reload-fx");
  const modes = new Map([
    [8, "매매기준율"], [1, "현찰 사실 때"], [3, "현찰 파실 때"],
    [5, "전신환 보내실 때"], [6, "전신환 받으실 때"], [7, "외화수표 파실 때"]
  ]);
  const numbers = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
  let rates = new Map();
  let timer;
  let loading = false;

  function calculate() {
    const row = rates.get(currency.value);
    const rate = row?.values[quote.value];
    basis.textContent = rate ? row.unit + " " + currency.value + " = " + numbers.format(rate) + "원" : "";
    const fromWon = source === won;
    const target = fromWon ? foreign : won;
    foreignLabel.textContent = currency.value ? "외화 (" + currency.value + ")" : "외화";
    const raw = source.value.trim();
    result.textContent = "";
    target.value = "";
    if (!raw) return;

    const pattern = fromWon
      ? /^(?:\d+|\d{1,3}(?:,\d{3})+)$/
      : /^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/;
    const value = Number(raw.replaceAll(",", ""));
    if (!pattern.test(raw) || value > Number.MAX_SAFE_INTEGER) {
      result.textContent = fromWon ? "원화 금액은 원 단위로 입력해 주세요." : "외화 금액을 숫자로 입력해 주세요.";
      return;
    }
    if (!rate) return;
    const converted = fromWon ? value * row.unit / rate : value * rate / row.unit;
    const digits = fromWon ? new Intl.NumberFormat("ko-KR", {
      style: "currency", currency: currency.value
    }).resolvedOptions().maximumFractionDigits : 0;
    target.value = new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: digits
    }).format(converted);
  }

  function setQuotes() {
    const previous = quote.value;
    const row = rates.get(currency.value);
    quote.replaceChildren();
    for (const [index, name] of modes) {
      const option = new Option(name + (row.values[index] ? "" : " · 미고시"), String(index));
      option.disabled = !row.values[index];
      quote.add(option);
    }
    quote.value = row.values[previous] ? previous : String([...modes.keys()].find(index => row.values[index]));
    quote.disabled = false;
    calculate();
  }

  function parse(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector(".printdiv table.tblBasic");
    const headers = [...(table?.querySelectorAll("thead th") || [])].map(cell => cell.textContent.replace(/\s/g, ""));
    if (headers.join("|") !== "통화|현찰|송금|외화수표파실때|매매기준율|환가료율|미화환산율|사실때|파실때|보낼때|받을때|환율|Spread|환율|Spread") {
      throw Error("Unexpected rate table");
    }
    const rows = new Map();
    for (const tr of table.tBodies[0].rows) {
      const cells = [...tr.cells];
      if (cells.length !== 11) throw Error("Unexpected rate columns");
      const name = cells[0].textContent.trim().replace(/\s+/g, " ");
      const match = name.match(/\b([A-Z]{3})\b(?:\s*\((\d+)\))?$/);
      if (!match) throw Error("Unknown quote unit");
      const values = cells.map(cell => {
        const n = Number(cell.textContent.trim().replaceAll(",", ""));
        return Number.isFinite(n) && n > 0 ? n : null;
      });
      if (values[8]) rows.set(match[1], { name, unit: Number(match[2] || 1), values });
    }
    const stamp = [...doc.querySelectorAll(".txtRateBox .fl strong")].slice(1)
      .map(el => el.textContent.trim()).join(" ");
    if (!stamp || !rows.size) throw Error("Missing publication");
    return { rows, stamp };
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    reload.disabled = true;
    status.textContent = "하나은행 최신 고시를 조회하고 있어요.";
    try {
      const response = await fetch("https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do", {
        method: "POST", credentials: "omit", cache: "no-store",
        signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ ajax: "true", pbldDvCd: "3", inqStrDt: "", inqKindCd: "1", requestTarget: "searchContentDiv" })
      });
      if (!response.ok) throw Error("Rate request failed");
      const { rows, stamp } = parse(await response.text());
      const current = currency.value;
      rates = rows;
      currency.replaceChildren(...Array.from(rows, ([code, row]) => new Option(row.name, code)));
      currency.value = rows.has(current) ? current : (rows.has("USD") ? "USD" : rows.keys().next().value);
      currency.disabled = false;
      setQuotes();
      status.textContent = "하나은행 고시 · " + stamp;
    } catch {
      rates.clear();
      currency.disabled = quote.disabled = true;
      calculate();
      status.textContent = "최신 고시환율을 불러오지 못했어요. 다시 조회해 주세요.";
    } finally {
      reload.disabled = loading = false;
    }
  }

  currency.addEventListener("change", setQuotes);
  quote.addEventListener("change", calculate);
  for (const input of [won, foreign]) {
    input.addEventListener("input", () => {
      source = input;
      calculate();
    });
  }
  reload.addEventListener("click", refresh);
  panel.addEventListener("toggle", () => {
    clearInterval(timer);
    if (panel.open) {
      refresh();
      timer = setInterval(refresh, 60000);
    }
  });
})();