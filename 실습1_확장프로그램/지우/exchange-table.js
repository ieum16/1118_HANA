export const currencies = ["USD", "JPY", "EUR"];
export const units = { USD: 1, JPY: 100, EUR: 1 };

const codes = /\b(USD|EUR|JPY)\b/i;
const codePrefix = /^\s*\|?\s*(?:\d+[.)]?[\s|]+)?(?:(?:미국|유럽(?:연합)?|일본)[\p{L}\d\s(]*[\s(])?$/u;
const names = /^\s*(?:\d+[.)]?\s+)?(미국\s*달러|유럽(?:연합)?\s*유로|일본\s*(?:(?:100|1)\s*)?엔)/;
const number = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/;
const cellNumber = /(?<![\w.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*%?(?![\w.,])/g;

export function parseNumber(text) {
  const value = text.normalize("NFKC").trim();
  if (!number.test(value)) return null;
  const result = Number(value.replaceAll(",", ""));
  return Number.isFinite(result) ? result : null;
}

function splitCells(line) {
  return line.trim().replace(/^\||\|$/g, "").split(/\t|\|| {2,}/).map(cell => cell.trim());
}

function headerKey(text) {
  return text.replace(/[^\p{L}]/gu, "");
}

function currencyIn(line) {
  const code = line.match(codes);
  if (code && codePrefix.test(line.slice(0, code.index))) return code[1].toUpperCase();
  const name = line.match(names)?.[1];
  if (name?.startsWith("미국")) return "USD";
  if (name?.startsWith("유럽")) return "EUR";
  if (name?.startsWith("일본")) return "JPY";
  return null;
}

function numericCells(line) {
  const currency = line.match(codes) ?? line.match(names);
  const values = line.slice(currency.index + currency[0].length)
    .replace(/(?:\b(?:1|100)\s*엔|^\s*\(\s*(?:1|100)\s*\))/g, "");
  return [...values.matchAll(cellNumber)].map(match => match[0].trim());
}

function baseCell(text) {
  return ["매매기준율", "매매기준환율", "기준환율", "기준율"].includes(headerKey(text));
}

function parseCell(text = "") {
  return parseNumber(text.replace(/\s*(원|%)$/, ""));
}

function spread(base, nominal, direction, listed) {
  const margin = parseCell(listed);
  if (margin !== null && margin >= 0 && margin <= 100) return String(margin);

  const quote = parseCell(nominal);
  if (quote === null || quote <= 0) return undefined;
  const inferred = (direction * (quote - base) / base) * 100;
  return inferred >= 0 && inferred <= 100 ? String(Number(inferred.toFixed(6))) : undefined;
}

function flatRow(line, headers) {
  const cells = splitCells(line);
  const header = headers.find(columns => columns.length === cells.length && columns.some(baseCell));
  if (!header) return null;

  const get = predicate => cells[header.findIndex(predicate)];
  const buy = key => /사실때|살때/.test(key);
  const sell = key => /파실때|팔때/.test(key);
  const cashCell = (cell, side) => {
    const key = headerKey(cell);
    return side(key) && !/송금|수표/.test(key) && /^(현찰|사실때|파실때|살때|팔때)/.test(key);
  };
  const spreadCell = (cell, side) => side(headerKey(cell)) && /스프레드|spread/i.test(headerKey(cell));
  const cashValues = side => {
    const nominal = get(cell => cashCell(cell, side))?.match(cellNumber) ?? [];
    const listed = get(cell => spreadCell(cell, side))?.match(cellNumber) ?? [];
    return [nominal.find(value => !value.includes("%"))?.trim(),
      listed.find(value => value.includes("%"))?.trim() ?? (listed.length === 1 && nominal[0] !== listed[0] ? listed[0].trim() : undefined)];
  };
  const [buyRate, buySpread] = cashValues(buy);
  const [sellRate, sellSpread] = cashValues(sell);
  return [
    get(baseCell),
    buyRate, sellRate, buySpread, sellSpread
  ];
}

function bankRow(values, header) {
  if (header.includes("한국은행기준율") && header.includes("대미환산율") && values.length === 10) {
    const [,, buy, buySpread, sell, sellSpread,, base] = values;
    return [base, buy, sell, buySpread, sellSpread];
  }
  if (header.includes("여행자수표") && header.includes("외화수표") && values.length === 10) {
    const [base,,, buy, sell, buySpread, sellSpread] = values;
    return [base, buy, sell, buySpread, sellSpread];
  }
  if (header.includes("환가료율") && header.includes("미화환산율") && values.length === 11) {
    const [buy, buySpread, sell, sellSpread,,,,, base] = values;
    return [base, buy, sell, buySpread, sellSpread];
  }
  return values.length === 1 ? values : null;
}

export function parseBankTable(text) {
  const lines = text.normalize("NFKC").split(/\r?\n/);
  const headerLines = lines.filter(line => !currencyIn(line) && line.trim());
  const headers = headerLines.map(splitCells);
  const header = headerKey(headerLines.join(""));
  const result = {};

  for (const line of lines) {
    const code = currencyIn(line);
    if (!code || result[code]) continue;
    const row = flatRow(line, headers) ?? bankRow(numericCells(line), header);
    if (!row) continue;

    const [rawBase, buy, sell, buySpread, sellSpread] = row;
    const base = parseCell(rawBase);
    if (base === null || base <= 0 || rawBase.includes("%")) continue;

    const multiplier = code === "JPY" && /(?<!\d)1\s*엔/.test(line) ? units.JPY : 1;
    result[code] = {
      base: String(Number((base * multiplier).toFixed(8))),
      buy: spread(base, buy, 1, buySpread),
      sell: spread(base, sell, -1, sellSpread)
    };
  }

  return result;
}
