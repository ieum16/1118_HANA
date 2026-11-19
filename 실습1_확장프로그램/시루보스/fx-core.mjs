export const CURRENCIES = ['USD', 'JPY', 'EUR'];
export const UNIT = { USD: 1, JPY: 100, EUR: 1 };

export function numberValue(raw) {
  const text = String(raw ?? '').normalize('NFKC').trim().replace(/,/g, '');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return NaN;
  return Number(text);
}

export function calculate(currency, values) {
  const rate = numberValue(values.rate);
  const amount = numberValue(values.amount);
  const spread = numberValue(values.spread);
  const discount = numberValue(values.discount);
  if (!UNIT[currency] || !Number.isFinite(rate) || rate <= 0) return { error: '기준환율을 0보다 크게 입력해 주세요.' };
  if (!Number.isFinite(amount) || amount < 0) return { error: '외화 금액을 0 이상으로 입력해 주세요.' };
  if (!Number.isFinite(spread) || spread < 0 || spread > 100) return { error: '스프레드는 0~100%로 입력해 주세요.' };
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) return { error: '우대율은 0~100%로 입력해 주세요.' };
  const margin = spread / 100 * (1 - discount / 100);
  const base = amount / UNIT[currency] * rate;
  const buyRate = rate * (1 + margin);
  const sellRate = rate * (1 - margin);
  const buy = amount / UNIT[currency] * buyRate;
  const sell = amount / UNIT[currency] * sellRate;
  if (![base, buy, sell].every(Number.isFinite)) return { error: '금액이 너무 커요. 더 작은 값을 입력해 주세요.' };
  return { base, buy, sell, buyRate, sellRate };
}

function cells(line, csv = false) {
  if (line.includes('\t')) return line.split('\t').map(value => value.trim());
  if (line.includes(',') && (csv || line.includes('"') || /통화|기준|currency/i.test(line))) {
    return (line.match(/(?:"[^"]*"|[^,]+|(?<=,)(?=,))/g) || []).map(value => value.replace(/^"|"$/g, '').trim());
  }
  return line.trim().split(/\s{2,}/);
}

const baseHeader = text => /^(매매\s*기준[율률]|기준\s*환율|기준[율률]|base\s*rate)(?:\s*\([^)]*\))?$/i.test(text.trim());

// A complete table header identifies the base-rate column; without one only
// unambiguous currency + one-number rows are accepted.
export function parseRates(text) {
  const rates = {};
  const warnings = [];
  let header = null;
  for (const original of text.normalize('NFKC').split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    const columns = cells(line, header?.csv);
    const baseIndex = columns.findIndex(baseHeader);
    if (baseIndex >= 0) {
      header = columns.length > 1 ? { columns, baseIndex, csv: !line.includes('\t') && line.includes(',') } : null;
      continue;
    }
    const matches = [...line.matchAll(/\b(USD|JPY|EUR)\b/gi)];
    if (!matches.length) continue;
    if (matches.length !== 1) { warnings.push('통화별로 한 줄씩 붙여넣어 주세요.'); continue; }
    const currency = matches[0][1].toUpperCase();
    let raw;
    if (header && columns.length === header.columns.length) {
      raw = columns[header.baseIndex];
    } else {
      const cleaned = line.replace(/JPY\s*\(\s*100\s*\)/gi, '').replace(/\b(?:USD|JPY|EUR)\b/gi, '').replace(/\(?\s*(?:100|1)\s*(?:엔|JPY)\s*\)?/gi, '');
      if (/-\s*\d/.test(cleaned)) { warnings.push(currency + ': 음수 환율은 적용하지 않아요.'); continue; }
      const numbers = cleaned.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || [];
      if (numbers.length === 1) raw = numbers[0];
    }
    const value = numberValue(String(raw ?? '').replace(/\s*원\s*$/, ''));
    if (!Number.isFinite(value) || value <= 0) { warnings.push(currency + ': 기준환율 열을 찾지 못했어요.'); continue; }
    if (Object.hasOwn(rates, currency)) { warnings.push(currency + ': 여러 행이 있어 첫 번째 값만 적용해요.'); continue; }
    const unitText = header ? header.columns.join(' ') + ' ' + line : line;
    rates[currency] = currency === 'JPY' && /(?:^|[^\d])1\s*엔/.test(unitText) && !/100\s*엔/.test(unitText) ? value * 100 : value;
  }
  return { rates, warnings: [...new Set(warnings)] };
}
