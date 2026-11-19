(() => {
  const units = { USD: 1, JPY: 100, EUR: 1 };
  const codes = Object.keys(units);
  const rateInputs = [...document.querySelectorAll('[data-rate]')];
  const currency = document.querySelector('#fx-currency');
  const amount = document.querySelector('#fx-amount');
  const spread = document.querySelector('#fx-spread');
  const discount = document.querySelector('#fx-discount');
  const base = document.querySelector('#fx-base');
  const buy = document.querySelector('#fx-buy');
  const sell = document.querySelector('#fx-sell');
  const validation = document.querySelector('#fx-validation');
  const tableInput = document.querySelector('#fx-table');
  const importStatus = document.querySelector('#fx-import-status');
  const saveStatus = document.querySelector('#fx-save-status');
  const formatWon = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
  const settings = {};
  let lastWrite = 0;

  function numeric(text, suffix = '') {
    const normalized = text.normalize('NFKC').trim();
    const value = suffix && normalized.endsWith(suffix)
      ? normalized.slice(0, -suffix.length).trim()
      : normalized;
    if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(value)) return NaN;
    const number = Number(value.replaceAll(',', ''));
    return Number.isFinite(number) ? number : NaN;
  }

  function render() {
    const code = currency.value;
    const enteredRate = settings[`fx:rate:${code}`] ?? '';
    const rate = numeric(enteredRate, '원');
    const quantity = numeric(amount.value);
    const margin = numeric(spread.value, '%');
    const preference = discount.value.trim() ? numeric(discount.value, '%') : 0;
    const conversion = quantity / units[code] * rate;
    const hasBase = rate > 0 && Number.isSafeInteger(Math.round(conversion));
    const marginValid = margin >= 0 && margin <= 100;
    const preferenceValid = preference >= 0 && preference <= 100;

    base.textContent = hasBase ? `${formatWon.format(conversion)}원` : '—';
    buy.textContent = sell.textContent = '—';
    if (hasBase && marginValid && preferenceValid) {
      const commission = conversion * (margin / 100) * (1 - preference / 100);
      buy.textContent = `${formatWon.format(conversion + commission)}원`;
      sell.textContent = `${formatWon.format(conversion - commission)}원`;
    }

    let error = '';
    if (enteredRate.trim() && !(rate > 0)) error = '기준환율은 0보다 큰 숫자로 입력해 주세요.';
    else if (amount.value.trim() && !Number.isFinite(quantity)) error = '외화 금액을 0 이상의 숫자로 입력해 주세요.';
    else if (amount.value.trim() && !enteredRate.trim()) error = `${code} 기준환율을 입력해 주세요.`;
    else if (Number.isFinite(quantity) && rate > 0 && !hasBase) error = '환산 금액이 너무 커요.';
    else if (spread.value.trim() && !marginValid) error = '스프레드는 0~100%로 입력해 주세요.';
    else if (!preferenceValid) error = '우대율은 0~100%로 입력해 주세요.';
    else if (discount.value.trim() && !spread.value.trim()) error = '우대율을 적용하려면 스프레드를 입력해 주세요.';
    validation.textContent = error;
    validation.hidden = !error;
  }

  function showCurrencySettings() {
    spread.value = settings[`fx:spread:${currency.value}`] ?? '';
    discount.value = settings[`fx:discount:${currency.value}`] ?? '';
  }

  async function store(updates) {
    Object.assign(settings, updates);
    render();
    const sequence = ++lastWrite;
    try {
      await chrome.storage.local.set(updates);
      if (sequence === lastWrite) saveStatus.textContent = '';
    } catch {
      if (sequence === lastWrite) saveStatus.textContent = '입력값을 저장하지 못했어요. 다시 입력해 주세요.';
    }
  }

  function textRow(line) {
    const trimmed = line.trim();
    if (line.includes('\t')) return line.split('\t');
    if (trimmed.includes('|')) return trimmed.replace(/^\||\|$/g, '').split('|');
    if (/^(?:"|[^,\d]+,)/.test(trimmed)) {
      return [...trimmed.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)]
        .map(([, quoted, plain]) => quoted?.replaceAll('""', '"') ?? plain);
    }
    if (/ {2,}/.test(trimmed)) return trimmed.split(/ {2,}/);
    const pair = trimmed.match(/^(.+?)(?:\s+|\s*[:=]\s*)([\d.,]+\s*원?)$/);
    if (pair && !/\d/.test(pair[1].replace(/\(\s*(?:1|100)\s*\)|(?:1|100)\s*엔/g, ''))) {
      return [pair[1], pair[2]];
    }
    return [trimmed];
  }

  function htmlTableRows(html) {
    // Read only text from the clipboard table. Its markup stays in an inert template.
    const source = document.createElement('template');
    source.innerHTML = html;
    return [...source.content.querySelectorAll('table')].map(table => {
      const rows = [];
      [...table.rows].forEach((row, rowIndex) => {
        rows[rowIndex] ??= [];
        let column = 0;
        for (const cell of row.cells) {
          while (rows[rowIndex][column] !== undefined) column++;
          for (let offset = 0; offset < Math.min(cell.rowSpan || 1, table.rows.length - rowIndex); offset++) {
            const target = rows[rowIndex + offset] ??= [];
            for (let width = 0; width < cell.colSpan; width++) {
              target[column + width] = cell.textContent;
            }
          }
          column += cell.colSpan;
        }
      });
      return rows;
    });
  }

  function currencyCode(label) {
    const code = label.match(/\b(USD|JPY|EUR)\b/i)?.[1];
    if (code) return code.toUpperCase();
    const name = label.replace(/\s+/g, '');
    if (/^(미국(?:달러(?:화)?)?|미달러|달러)$/.test(name)) return 'USD';
    if (/^(일본(?:1|100)?(?:엔(?:화)?)?|(?:1|100)?엔(?:화)?)$/.test(name)) return 'JPY';
    if (/^(유로(?:화)?|유럽(?:연합)?(?:유로(?:화)?)?)$/.test(name)) return 'EUR';
    return undefined;
  }

  function ratesFromRows(rows) {
    const isBaseHeader = cell => /^\s*(?:매매\s*기준율|기준\s*환율|base\s*rate)(?:\s*\([^)]*\))?\s*$/i.test(cell ?? '');
    const header = rows.find(row => row.length > 1 && row.some(isBaseHeader));
    const baseColumn = header?.findIndex(isBaseHeader);
    if (!header && rows.some(row => /현찰|송금|살\s*때|팔\s*때|사실\s*때|파실\s*때/.test(row.join(' ')))) return {};

    const imported = {};
    const conflicts = new Set();
    for (const row of rows) {
      const cells = Array.from(row, cell => (cell ?? '').normalize('NFKC').trim());
      const code = cells.map(currencyCode).find(Boolean);
      if (!code) continue;

      const numbers = cells.map(cell => numeric(cell, '원')).filter(Number.isFinite);
      const value = header ? numeric(cells[baseColumn] ?? '', '원')
        : numbers.length === 1 ? numbers[0] : NaN;
      if (!(value > 0)) continue;

      const labels = [...cells, header?.[baseColumn] ?? ''].join(' ');
      const singleYen = /(?:^|[^\d])1\s*엔|JPY\s*\(\s*1\s*\)|\b1\s*JPY\b/i.test(labels);
      const rate = code === 'JPY' && singleYen ? Number((value * 100).toPrecision(15)) : value;
      if (!Number.isFinite(rate)) continue;
      if (code in imported && imported[code] !== rate) conflicts.add(code);
      imported[code] = rate;
    }
    for (const code of conflicts) delete imported[code];
    return imported;
  }

  async function importRates(text, html = '') {
    let imported = {};
    if (html) {
      for (const rows of htmlTableRows(html)) {
        const rates = ratesFromRows(rows);
        if (Object.keys(rates).length) {
          imported = rates;
          break;
        }
      }
    }
    if (!Object.keys(imported).length) {
      imported = ratesFromRows(text.normalize('NFKC').split(/\r?\n/).map(textRow));
    }

    const updates = {};
    const updatedCodes = [];
    for (const input of rateInputs) {
      const code = input.dataset.rate;
      if (imported[code] === undefined) continue;
      const value = String(imported[code]);
      if (!Number.isFinite(numeric(value)) || value.length > input.maxLength) continue;
      input.value = value;
      updates[`fx:rate:${code}`] = value;
      updatedCodes.push(code);
    }

    if (!updatedCodes.length) {
      importStatus.textContent = '기준환율을 찾지 못했어요. 통화와 매매기준율 열을 함께 붙여넣어 주세요.';
      return;
    }
    await store(updates);
    importStatus.textContent = `${updatedCodes.join(' · ')} 기준환율을 채웠어요.`;
  }

  async function initialize() {
    const keys = codes.flatMap(code => [`fx:rate:${code}`, `fx:spread:${code}`, `fx:discount:${code}`]);
    try {
      Object.assign(settings, await chrome.storage.local.get(['fx:currency', 'fx:amount', ...keys]));
      currency.value = codes.includes(settings['fx:currency']) ? settings['fx:currency'] : 'USD';
      amount.value = settings['fx:amount'] ?? '';
      for (const input of rateInputs) input.value = settings[`fx:rate:${input.dataset.rate}`] ?? '';
      showCurrencySettings();
      render();
      document.querySelector('#fx-fields').disabled = false;
    } catch {
      saveStatus.textContent = '저장된 환율 입력값을 불러오지 못했어요. 팝업을 다시 열어 주세요.';
    }
  }

  for (const input of rateInputs) {
    input.addEventListener('input', () => store({ [`fx:rate:${input.dataset.rate}`]: input.value }));
  }
  amount.addEventListener('input', () => store({ 'fx:amount': amount.value }));
  spread.addEventListener('input', () => store({ [`fx:spread:${currency.value}`]: spread.value }));
  discount.addEventListener('input', () => store({ [`fx:discount:${currency.value}`]: discount.value }));
  currency.addEventListener('change', () => {
    showCurrencySettings();
    store({ 'fx:currency': currency.value });
  });
  tableInput.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain');
    const html = event.clipboardData?.getData('text/html') ?? '';
    if (!text && !html) return;
    event.preventDefault();
    tableInput.value = text ?? '';
    importRates(tableInput.value, html);
  });
  tableInput.addEventListener('input', () => { importStatus.textContent = ''; });
  document.querySelector('#fx-import').addEventListener('click', () => importRates(tableInput.value));
  initialize();
})();
