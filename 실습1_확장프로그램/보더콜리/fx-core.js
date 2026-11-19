/* Shared calculation and bank-table parsing, independent of the popup UI. */
globalThis.Exchange = (() => {
  const codes = ['USD', 'JPY', 'GBP', 'CAD', 'CNY'];

  function number(text) {
    const value = String(text).normalize('NFKC').trim().replace(/원$/, '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return NaN;
    return Number(value.replace(/,/g, ''));
  }

  function calculate(rate, amount, unit, buySpread, sellSpread, discount) {
    if (![rate, amount, unit, buySpread, sellSpread, discount].every(Number.isFinite)
      || rate <= 0 || amount < 0 || ![1, 100].includes(unit)
      || buySpread < 0 || buySpread > 100 || sellSpread < 0 || sellSpread > 100
      || discount < 0 || discount > 100) return null;
    const base = amount * rate / unit;
    const remaining = (1 - discount / 100) / 100;
    const buy = base * (1 + buySpread * remaining);
    const sell = base * (1 - sellSpread * remaining);
    if (Math.max(base, buy, sell) > Number.MAX_SAFE_INTEGER) return null;
    return { base, buy, sell };
  }

  function cells(line) {
    if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
    if (line.includes('|')) return line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim());
    if (/^(?:"[^"]+"|[A-Za-z가-힣 ]+(?:\(\s*(?:1|100)\s*\))?),/.test(line)) {
      const result = [];
      let value = '';
      let quoted = false;
      for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
        else if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) { result.push(value.trim()); value = ''; }
        else value += char;
      }
      result.push(value.trim());
      return result;
    }
    return line.trim().split(/\s{2,}/);
  }

  function currency(text) {
    const code = text.toUpperCase().match(/\b(USD|JPY|GBP|CAD|CNY)\b/);
    if (code) return code[1];
    if (/캐나다/.test(text)) return 'CAD';
    if (/미국|미\s*달러/.test(text)) return 'USD';
    if (/일본|엔화/.test(text)) return 'JPY';
    if (/영국|파운드/.test(text)) return 'GBP';
    if (/중국|위안/.test(text)) return 'CNY';
    return null;
  }

  function parseTable(text, column = 'auto') {
    const rows = text.normalize('NFKC').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rates = {};
    const rejected = new Set();
    let header = null;
    let baseIndex = -1;
    for (const line of rows) {
      const row = cells(line);
      const index = row.findIndex((cell) => /^(?:매매)?기준(?:환율|율)$/.test(cell.replace(/\s/g, '')));
      if (index >= 0) { header = row; baseIndex = index; continue; }
      const code = currency(line);
      if (!code) continue;
      const currencyIndex = row.findIndex((cell) => currency(cell) === code);
      const label = row.filter((cell) => currency(cell) === code).join(' ');
      // Unit markers belong to the currency label, never to the rate values.
      const unitMatch = label.match(/\(\s*(100|1)\s*(?:엔|JPY)?\s*\)|\bJPY\s*(100|1)\b|(100|1)\s*엔/i);
      const unit = code === 'JPY' && unitMatch ? Number(unitMatch[1] || unitMatch[2] || unitMatch[3]) : undefined;
      let rate = NaN;
      if (column === 'auto' && header && row.length === header.length && baseIndex !== currencyIndex) {
        rate = number(row[baseIndex]);
      } else {
        const valueText = row.slice(currencyIndex).join(' ')
          .replace(/\(\s*(?:100|1)\s*(?:엔|JPY)?\s*\)|\bJPY\s*(?:100|1)\b|(?:100|1)\s*엔/gi, '');
        const values = [...valueText.matchAll(/(?<![\d.,])[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\d.,])/g)].map((match) => number(match[0]));
        if (column !== 'auto') rate = values[Number(column) - 1];
        else if (values.length === 1) rate = values[0];
      }
      if (!(rate > 0) || !Number.isFinite(rate)) { rejected.add(code); continue; }
      if (rates[code] && (rates[code].rate !== rate || rates[code].unit !== unit)) {
        rejected.add(code);
        continue;
      }
      rates[code] = { rate, unit };
    }
    // Conflicting rows require the user to paste one rate table at a time.
    for (const code of rejected) delete rates[code];
    return { rates, rejected: [...rejected] };
  }

  return Object.freeze({ codes, number, calculate, parseTable });
})();
