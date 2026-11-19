const FxMath = (() => {
  const units = { USD: 1, JPY: 100, EUR: 1 };
  function number(value) {
    const text = String(value).trim().replace(/원$|%$/g, '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return NaN;
    return Number(text.replaceAll(',', ''));
  }
  function calculate(rate, amount, currency, buySpread, sellSpread, discount) {
    if (![rate, amount, buySpread, sellSpread, discount].every(Number.isFinite) || rate <= 0 || amount < 0 || !units[currency] || buySpread < 0 || buySpread > 100 || sellSpread < 0 || sellSpread > 100 || discount < 0 || discount > 100) return null;
    const base = rate * (amount / units[currency]);
    const factor = (1 - discount / 100) / 100;
    const result = { base, buy: base * (1 + buySpread * factor), sell: base * (1 - sellSpread * factor) };
    return Object.values(result).every(value => Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER) ? result : null;
  }
  function parseRows(rows) {
    const rates = {};
    const skipped = new Set();
    let baseColumn = -1;
    for (const row of rows) {
      const header = row.findIndex(cell => /매매\s*기준|기준\s*환율|base\s*rate/i.test(cell));
      if (header !== -1) { baseColumn = header; continue; }
      const currencyCell = row.findIndex(cell => /\b(USD|JPY|EUR)\b/i.test(cell) || /미국|일본|유로/.test(cell));
      if (currencyCell === -1) continue;
      const label = row[currencyCell];
      const currency = label.match(/\b(USD|JPY|EUR)\b/i)?.[1].toUpperCase() || (/미국/.test(label) ? 'USD' : /일본/.test(label) ? 'JPY' : 'EUR');
      // A single-rate row is unambiguous. Multi-column tables require a base-rate header.
      const tail = row.slice(currencyCell).join(' ').replace(/\b(?:USD|JPY|EUR)\b/gi, '').replace(/\(?100\s*(?:엔|JPY)\)?/gi, '').replace(/\(?1\s*엔\)?/g, '');
      const values = tail.match(/\d[\d,]*(?:\.\d+)?/g) || [];
      const value = baseColumn > currencyCell ? number(row[baseColumn] ?? '') : values.length === 1 ? number(values[0]) : NaN;
      const perYen = currency === 'JPY' && /(?:\b1\s*엔|\bJPY\s*\(?1\s*\)?(?:\s|$))/.test(label);
      const normalized = value * (perYen ? 100 : 1);
      if (Number.isFinite(normalized) && normalized > 0) rates[currency] = String(normalized);
      else skipped.add(currency);
    }
    return { rates, skipped: [...skipped].filter(currency => !(currency in rates)) };
  }
  function parseText(text) {
    const rows = text.split(/\r?\n/).filter(line => line.trim()).map(line => {
      if (line.includes('\t')) return line.split('\t').map(cell => cell.trim());
      if (line.includes('|')) return line.split('|').map(cell => cell.trim());
      if (/^\s*"/.test(line) || /(?:USD|JPY|EUR),\s*[\d"]/.test(line)) return (line.match(/"[^"]*"|[^,]+/g) || []).map(cell => cell.replace(/^"|"$/g, '').trim());
      return line.trim().split(/\s{2,}/);
    });
    return parseRows(rows);
  }
  return { number, calculate, parseRows, parseText };
})();
