globalThis.FxCore = (() => {
  const KEY = 'today-cat-fx-v1', CODES = ['USD', 'JPY', 'EUR'];
  const defaults = () => ({ selected: 'USD', paste: '', currencies: Object.fromEntries(CODES.map(code => [code,
    { amount: '', base: '', unit: code === 'JPY' ? '100' : '1', buySpread: '0', sellSpread: '0', preference: '0' }])) });
  function number(value) {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
    const result = Number(text.replaceAll(',', ''));
    return Number.isFinite(result) ? result : null;
  }
  function calculate(input) {
    const amount = number(input.amount), base = number(input.base), unit = number(input.unit);
    const buy = number(input.buySpread || '0'), sell = number(input.sellSpread || '0'), preference = number(input.preference || '0');
    if (amount === null || base === null) return { error: '외화 금액과 기준환율을 입력해 주세요.' };
    if (base <= 0 || ![1, 100].includes(unit)) return { error: '기준환율은 0보다 커야 해요.' };
    if ([buy, sell, preference].some(v => v === null || v < 0 || v > 100)) return { error: '스프레드와 우대율은 0~100%로 입력해 주세요.' };
    const factor = (1 - preference / 100) / 100;
    const buyRate = base * (1 + buy * factor), sellRate = base * (1 - sell * factor);
    const baseTotal = amount / unit * base, buyTotal = amount / unit * buyRate, sellTotal = amount / unit * sellRate;
    if ([baseTotal, buyTotal, sellTotal].some(v => !Number.isFinite(v) || v > Number.MAX_SAFE_INTEGER)) return { error: '계산할 수 있는 금액 범위를 넘었어요.' };
    return { baseTotal, buyTotal, sellTotal, buyRate, sellRate };
  }
  function currency(text) {
    return CODES.find(code => new RegExp(`\\b${code}\\b`, 'i').test(text)) || (/미국|미달러/.test(text) ? 'USD' : /일본|엔화/.test(text) ? 'JPY' : /유로|유럽연합/.test(text) ? 'EUR' : null);
  }
  function cells(line) {
    if (line.includes('\t')) return line.split('\t').map(s => s.trim());
    if (line.includes('|')) return line.replace(/^\s*\||\|\s*$/g, '').split('|').map(s => s.trim());
    // CSV with quoted thousands-separated amounts.
    if (/^(?:[^,]*,){2}/.test(line) && /"|(?:USD|JPY|EUR|Currency|통화),/i.test(line)) {
      return (line.match(/(?:"[^"]*"|[^,]*)(?:,|$)/g) || []).filter(Boolean).map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').trim());
    }
    const spaced = line.trim().split(/\s{2,}/);
    return spaced.length > 1 ? spaced : line.trim().split(/\s+/);
  }
  function heading(value) {
    const text = value.replace(/[\s()（）]/g, '');
    if (/매매기준|기준환율|기준율|^기준$|^base$/i.test(text)) return 'base';
    const buy = /사실때|살때|매입|buy/i.test(text), sell = /파실때|팔때|매도|sell/i.test(text);
    // Bank-side 매입/매도 is ambiguous; accept explicit customer-side wording only.
    if (/매입|매도/.test(text) && !/살때|팔때|사실때|파실때/.test(text)) return null;
    if (/송금|전신환|여행자|수표/.test(text)) return null;
    if (/우대/.test(text)) return 'preference';
    if (/스프레드|spread/i.test(text)) return buy ? 'buySpread' : sell ? 'sellSpread' : null;
    return buy ? 'buyRate' : sell ? 'sellRate' : null;
  }
  function parseTable(text) {
    const lines = text.replace(/\r/g, '').split('\n').map(s => s.trimEnd()).filter(s => s.trim());
    const headers = [], rows = {}, warnings = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex], code = currency(line), row = cells(line);
      // A header may itself contain USD/JPY/EUR, so require a numeric data cell.
      const numeric = row.map((cell, index) => ({ index, value: number(cell.replace(/\s*(?:원|%)\s*$/, '')) })).filter(cell => cell.value !== null);
      const hasHeading = /매매기준|기준환율|사실\s*때|파실\s*때|buy|sell|spread/i.test(line);
      if (!code || hasHeading) { if (lineIndex < 12) headers.push(row); continue; }
      const headerWidth = Math.max(0, ...headers.filter(header => header.some(cell => heading(cell) || /현찰|송금|전신환/.test(cell))).map(header => header.length));
      if (headerWidth > 1 && row.length !== headerWidth) {
        warnings.push(`${code}: 제목과 데이터의 열 개수가 달라요. 탭으로 구분된 표를 붙여넣어 주세요.`); continue;
      }
      let map = {};
      for (let i = 0; i < row.length; i++) {
        const label = headers.map(header => header[i] || '').join(' '), field = heading(label);
        if (field) {
          // Two identically named columns cannot be assigned safely.
          if (map[field] !== undefined) map[field] = -1; else map[field] = i;
        }
      }
      const parsed = {};
      for (const [field, index] of Object.entries(map)) {
        if (index < 0) continue;
        const value = number((row[index] || '').replace(/\s*(?:원|%)\s*$/, ''));
        if (value !== null) parsed[field] = value;
      }
      if (parsed.base === undefined && !headers.some(header => header.some(cell => heading(cell) || /현찰|송금|전신환|매입|매도/.test(cell)))) {
        // Unlabelled multi-column bank tables must never guess the base rate.
        let values = numeric.map(item => item.value);
        if (row.length === 1) {
          const cleaned = line.replace(/\(\s*100\s*(?:엔|JPY)?\s*\)|100\s*엔/gi, '').replace(/\b(?:USD|JPY|EUR)\b/gi, '');
          values = [...cleaned.matchAll(/(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?![\d.,])/g)].map(match => number(match[0])).filter(v => v !== null);
        }
        if (values.length === 1) parsed.base = values[0];
      }
      if (!(parsed.base > 0)) { warnings.push(`${code}: 매매기준율 열을 확인하지 못했어요.`); continue; }
      const unit = code === 'JPY' && !/(?:1\s*엔|JPY\s*\(1\))/.test(line.replace(/100\s*엔/g, '')) ? 100 : 1;
      const result = { base: String(parsed.base), unit: String(unit) };
      for (const field of ['buySpread', 'sellSpread', 'preference']) {
        if (parsed[field] !== undefined && parsed[field] >= 0 && parsed[field] <= 100) result[field] = String(parsed[field]);
      }
      if (parsed.buyRate >= parsed.base && result.buySpread === undefined) result.buySpread = String(Number(((parsed.buyRate / parsed.base - 1) * 100).toFixed(6)));
      if (parsed.sellRate > 0 && parsed.sellRate <= parsed.base && result.sellSpread === undefined) result.sellSpread = String(Number(((1 - parsed.sellRate / parsed.base) * 100).toFixed(6)));
      if (rows[code]) warnings.push(`${code}: 중복 행 중 마지막 행을 사용해요.`);
      rows[code] = result;
    }
    return { rows, warnings: [...new Set(warnings)] };
  }
  return { KEY, CODES, defaults, number, calculate, parseTable };
})();
