"use strict";

// Rates are KRW per `unit` foreign currency units. Spreads are percentages.
globalThis.FxCore = (() => {
  const currencies = {
    JPY: ["일본 엔", 100], USD: ["미국 달러", 1], EUR: ["유로", 1],
    CNY: ["중국 위안", 1], GBP: ["영국 파운드", 1], AUD: ["호주 달러", 1],
    CAD: ["캐나다 달러", 1], CHF: ["스위스 프랑", 1], HKD: ["홍콩 달러", 1],
    SGD: ["싱가포르 달러", 1], NZD: ["뉴질랜드 달러", 1], THB: ["태국 바트", 1],
    TWD: ["대만 달러", 1], VND: ["베트남 동", 100], IDR: ["인도네시아 루피아", 100],
    PHP: ["필리핀 페소", 1], MYR: ["말레이시아 링깃", 1], INR: ["인도 루피", 1],
    AED: ["아랍에미리트 디르함", 1], SAR: ["사우디 리얄", 1], RUB: ["러시아 루블", 1],
    DKK: ["덴마크 크로네", 1], NOK: ["노르웨이 크로네", 1], SEK: ["스웨덴 크로나", 1],
    MXN: ["멕시코 페소", 1], BRL: ["브라질 헤알", 1], ZAR: ["남아공 랜드", 1],
    TRY: ["튀르키예 리라", 1], PLN: ["폴란드 즈워티", 1], CZK: ["체코 코루나", 1],
    HUF: ["헝가리 포린트", 1], BHD: ["바레인 디나르", 1], KWD: ["쿠웨이트 디나르", 1]
  };
  function number(value) {
    const text = String(value ?? "").trim().replace(/[₩원%]/g, "").trim();
    if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(text)) return NaN;
    return Number(text.replaceAll(",", ""));
  }
  function defaults(code) {
    return { base: "", unit: String(currencies[code]?.[1] || 1), buySpread: "0", sellSpread: "0", preference: "0" };
  }
  function calculate(amount, record) {
    const a = number(amount), b = number(record.base), unit = number(record.unit);
    if (!Number.isFinite(a) || a < 0) throw new Error("외화 금액을 0 이상의 숫자로 입력해 주세요.");
    if (!Number.isFinite(b) || b <= 0) throw new Error("기준환율을 0보다 큰 숫자로 입력해 주세요.");
    if (![1, 100, 1000].includes(unit)) throw new Error("환율의 기준 단위를 확인해 주세요.");
    const buy = number(record.buySpread), sell = number(record.sellSpread), preference = number(record.preference);
    if (![buy, sell, preference].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) {
      throw new Error("스프레드와 우대율은 0~100%로 입력해 주세요.");
    }
    const discount = 1 - preference / 100;
    const buyRate = b * (1 + buy / 100 * discount);
    const sellRate = b * (1 - sell / 100 * discount);
    const result = { base: a / unit * b, buy: a / unit * buyRate, sell: a / unit * sellRate, buyRate, sellRate };
    if (!Object.values(result).every(Number.isFinite) ||
      ![result.base, result.buy, result.sell].every(n => Number.isSafeInteger(Math.round(n)))) throw new Error("입력한 금액이 너무 커요.");
    return result;
  }
  function splitLine(line) {
    if (line.includes("\t")) return line.split("\t").map(s => s.trim());
    if (line.includes("|")) return line.replace(/^\s*\||\|\s*$/g, "").split("|").map(s => s.trim());
    // CSV is accepted when it has quoted cells or comma-delimited text headers.
    if (line.includes('"') || /(?:통화|currency|매매|기준)[^\t]*,/i.test(line)) return csv(line);
    return line.trim().split(/\s{2,}/);
  }
  function csv(line) {
    const cells = []; let value = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (c === "," && !quoted) { cells.push(value.trim()); value = ""; }
      else value += c;
    }
    cells.push(value.trim()); return cells;
  }
  function parseTable(text) {
    if (text.length > 50000) throw new Error("표가 너무 길어요. 환율 부분만 붙여넣어 주세요.");
    const rows = []; const warnings = []; let headers = null; let csvMode = false;
    const baseHeader = /^(?:매매\s*기준(?:율|환율)?|기준\s*환율|기준율|base\s*(?:rate)?)$/i;
    const buyHeader = /^(?:(?:현찰)?\s*(?:사실\s*때|살\s*때)|cash\s*buy)$/i;
    const sellHeader = /^(?:(?:현찰)?\s*(?:파실\s*때|팔\s*때)|cash\s*sell)$/i;
    for (const raw of text.replaceAll("\r", "").split("\n")) {
      if (!raw.trim()) continue;
      let cells = csvMode && !raw.includes("\t") ? csv(raw) : splitLine(raw);
      const baseIndex = cells.findIndex(cell => baseHeader.test(cell));
      if (baseIndex >= 0) {
        headers = { length: cells.length, base: baseIndex,
          buy: cells.findIndex(cell => buyHeader.test(cell)), sell: cells.findIndex(cell => sellHeader.test(cell)) };
        csvMode = !raw.includes("\t") && raw.includes(",") && cells.length > 1;
        continue;
      }
      const match = raw.toUpperCase().match(/\b[A-Z]{3}\b/g)?.find(code => Object.hasOwn(currencies, code));
      if (!match) continue;
      const code = match;
      const explicitUnit = raw.match(/(?:\(\s*|（\s*)(1|100|1000)\s*(?:엔|동|루피아|JPY|VND|IDR)?\s*[)）]/i)
        || raw.match(/\b(1000|100|1)\s*(?:JPY|VND|IDR|엔|동|루피아)\b/i);
      const unit = explicitUnit ? explicitUnit[1] : String(currencies[code][1]);
      let base, buy, sell;
      if (headers && cells.length === headers.length) {
        base = number(cells[headers.base]);
        buy = headers.buy >= 0 ? number(cells[headers.buy]) : NaN;
        sell = headers.sell >= 0 ? number(cells[headers.sell]) : NaN;
      } else {
        // A simple CODE + one rate row is unambiguous. Never guess among bank columns.
        const cleaned = raw.replace(/\([^)]*\)|（[^）]*）/g, "").replace(/\b(?:1000|100|1)\s*(?:JPY|VND|IDR)\b/gi, code);
        const numbers = cleaned.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || [];
        if (numbers.length === 1) base = number(numbers[0]);
      }
      if (!Number.isFinite(base) || base <= 0) {
        warnings.push(`${code}: 기준환율 열을 확인할 수 없어 건너뛰었어요.`); continue;
      }
      if (rows.some(row => row.code === code)) {
        warnings.push(`${code}: 중복 행은 건너뛰었어요.`); continue;
      }
      const row = { code, base: String(base), unit };
      if (Number.isFinite(buy) && buy >= base && buy <= base * 2) row.buySpread = String(Number(((buy / base - 1) * 100).toFixed(6)));
      if (Number.isFinite(sell) && sell > 0 && sell <= base) row.sellSpread = String(Number(((1 - sell / base) * 100).toFixed(6)));
      rows.push(row);
    }
    return { rows, warnings };
  }
  return Object.freeze({ currencies, number, defaults, calculate, parseTable });
})();
