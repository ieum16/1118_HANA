const exchangeUnits = { USD: 1, JPY: 100, EUR: 1 };
const fxNumberPattern = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+`;
const fxNumber = new RegExp(`^(?:${fxNumberPattern})$`);
const fxRate = new RegExp(String.raw`^(${fxNumberPattern})\s*(?:원|KRW)?$`, 'i');
const fxPair = new RegExp(String.raw`^(.+?)(?:\s+|\s*[:=]\s*)((?:${fxNumberPattern})\s*(?:원|KRW)?)$`, 'i');

function readFxNumber(value, percent = false) {
  const trimmed = value.normalize('NFKC').trim();
  const text = percent ? trimmed.replace(/\s*%$/, '') : trimmed;
  if (!fxNumber.test(text)) return null;
  const number = Number(text.replaceAll(',', ''));
  return number <= Number.MAX_SAFE_INTEGER ? number : null;
}

function calculateWon(currency, amount, rate, buySpread, sellSpread, discount) {
  const base = (amount / exchangeUnits[currency]) * rate;
  const remainingMargin = 1 - discount / 100;
  return {
    base,
    buy: buySpread === null ? null : base * (1 + (buySpread / 100) * remainingMargin),
    sell: sellSpread === null ? null : base * (1 - (sellSpread / 100) * remainingMargin),
  };
}

function readFxRate(cell = '') {
  const match = cell.normalize('NFKC').trim().match(fxRate);
  const rate = match ? readFxNumber(match[1]) : null;
  return rate > 0 ? rate : null;
}

function fxCurrency(cell) {
  return cell.match(/\b(USD|JPY|EUR)\b/i)?.[1].toUpperCase()
    ?? (/미국\s*달러/.test(cell) ? 'USD' : /일본[\s(]*(?:(?:1|100)\s*)?엔/.test(cell) ? 'JPY' : /유로/.test(cell) ? 'EUR' : null);
}

function readFxPercent(cell = '') {
  const percent = readFxNumber(cell, true);
  return percent !== null && percent <= 100 ? percent : null;
}

function spreadFromCash(cell = '', base, direction) {
  const reported = cell.match(/\(\s*([\d.]+\s*%)\s*\)/)?.[1];
  if (reported) return readFxPercent(reported);
  const cash = readFxRate(cell);
  if (cash === null) return null;
  const spread = ((cash - base) / base) * 100 * direction;
  return spread >= 0 && spread <= 100 ? Number(spread.toFixed(8)) : null;
}

function fxColumns(headers) {
  const labels = headers.map((cell) => cell.replace(/\s/g, '').toLowerCase());
  const base = labels.findIndex((label) => /^매매기준(?:율|환율)(?:\(.*\))?$/.test(label));
  const side = (label, pattern) => pattern.test(label) && !/송금|여행자|수표|전신환|t\/c/.test(label);
  const buy = /사실때|살때|매도/;
  const sell = /파실때|팔때|매입/;
  const spread = /스프레드|spread/;
  const combined = /현찰.*(?:사실때|살때|매도|파실때|팔때|매입)\([^)]*(?:스프레드|spread)/;
  const cash = (pattern) => {
    const match = (label) => side(label, pattern) && (!spread.test(label) || combined.test(label));
    const explicit = labels.findIndex((label) => match(label) && label.includes('현찰'));
    return explicit >= 0 ? explicit : labels.findIndex(match);
  };
  return {
    base: base >= 0 ? base : labels.findIndex((label) => /^(?:기준환율|기준율)(?:\(.*\))?$/.test(label)),
    buyCash: cash(buy),
    sellCash: cash(sell),
    buySpread: labels.findIndex((label) => spread.test(label) && !combined.test(label) && side(label, buy)),
    sellSpread: labels.findIndex((label) => spread.test(label) && !combined.test(label) && side(label, sell)),
    commonSpread: labels.findIndex((label) => spread.test(label) && !buy.test(label) && !sell.test(label)),
  };
}

function parseFxTable(text) {
  const values = new Map();
  let headers = [];
  let columns;
  for (const line of text.normalize('NFKC').split(/\r?\n/)) {
    const row = splitFxRow(line);
    const currencyIndex = row.findIndex(fxCurrency);
    if (currencyIndex < 0) {
      if (row.length < 2 || row.some((cell) => readFxRate(cell) !== null)) continue;
      const candidate = fxColumns(row);
      if (candidate.base >= 0) {
        headers = row;
        columns = candidate;
      } else if (headers.length === row.length && row.some((cell) => /사실|파실|살\s*때|팔\s*때|스프레드/.test(cell))) {
        const combined = headers.map((cell, index) => `${cell} ${row[index]}`);
        const merged = fxColumns(combined);
        if (merged.base >= 0) {
          headers = combined;
          columns = merged;
        }
      }
      continue;
    }

    const currencyLabel = row[currencyIndex];
    const currency = fxCurrency(currencyLabel);
    if (values.has(currency)) continue;
    const aligned = columns && row.length === headers.length && columns.base > currencyIndex;
    const tail = row.slice(currencyIndex + 1);
    const rate = aligned ? readFxRate(row[columns.base]) : tail.length === 1 ? readFxRate(tail[0]) : null;
    if (rate === null) continue;

    const oneYen = currency === 'JPY' && /(?:^|[^\d])1\s*(?:엔|JPY\b)/i.test(currencyLabel);
    const imported = { rate: oneYen ? Number((rate * 100).toPrecision(15)) : rate };
    if (aligned) {
      const commonSpread = readFxPercent(row[columns.commonSpread] ?? '');
      const buy = readFxPercent(row[columns.buySpread] ?? '') ?? commonSpread ?? spreadFromCash(row[columns.buyCash], rate, 1);
      const sell = readFxPercent(row[columns.sellSpread] ?? '') ?? commonSpread ?? spreadFromCash(row[columns.sellCash], rate, -1);
      if (buy !== null) imported.buySpread = buy;
      if (sell !== null) imported.sellSpread = sell;
    }
    values.set(currency, imported);
  }
  return values;
}

function splitFxRow(line) {
  const text = line.trim();
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (text.includes('|')) return text.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  // A comma is a delimiter only in CSV rows. Grouped numbers in plain text stay together.
  if (/^[^,\d]+,|^"/.test(text)) {
    return Array.from(text.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g),
      (match) => (match[1]?.replaceAll('""', '"') ?? match[2]).trim());
  }
  const pair = text.match(fxPair);
  return pair && fxCurrency(pair[1]) && !/현찰|송금|사실|파실|살\s*때|팔\s*때|스프레드/.test(pair[1]) ? [pair[1], pair[2]] : [text];
}

function fxClipboardTables(html) {
  // Keep clipboard HTML inert. Only the text in table cells reaches the popup.
  const fragment = document.createElement('template');
  fragment.innerHTML = html;
  return Array.from(fragment.content.querySelectorAll('table'), (table) => {
    const cells = [];
    const headers = [];
    const data = [];
    for (const [index, row] of Array.from(table.rows).entries()) {
      const current = (cells[index] ??= []);
      let col = 0;
      for (const cell of row.cells) {
        while (current[col] !== undefined) col++;
        const text = cell.textContent.trim().replace(/\s+/g, ' ');
        const width = Math.min(cell.colSpan, 32);
        const height = Math.min(cell.rowSpan || 1, 16);
        for (let offset = 0; offset < height; offset++) {
          const target = (cells[index + offset] ??= []);
          for (let column = col; column < col + width; column++) target[column] = text;
        }
        col += width;
      }
      if (!data.length && !current.some(fxCurrency) && !current.some((cell) => readFxRate(cell) !== null)) {
        headers.push(current);
      } else {
        data.push(current);
      }
    }
    const width = Math.max(0, ...headers.map((row) => row.length));
    const header = Array.from({ length: width }, (_, col) => [...new Set(headers.map((row) => row[col]).filter(Boolean))].join(' '));
    return [header, ...data].map((row) => row.join('\t')).join('\n');
  }).join('\n');
}
