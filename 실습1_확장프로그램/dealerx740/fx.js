(() => {
  const key = 'woody-fx-v1';
  const fields = [...document.querySelectorAll('[data-fx]')];
  const status = document.getElementById('fx-status');
  const output = document.getElementById('fx-results');
  const table = document.getElementById('fx-table');
  let state = {};
  try { state = JSON.parse(localStorage.getItem(key)) || {}; } catch { /* Start with empty fields. */ }
  for (const field of fields) {
    if (typeof state[field.dataset.fx] === 'string') field.value = state[field.dataset.fx];
    field.addEventListener('input', update);
  }
  function update() {
    for (const field of fields) state[field.dataset.fx] = field.value;
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch { status.textContent = '입력값을 저장하지 못했어요. 저장 공간을 확인해 주세요.'; }
    output.replaceChildren();
    const result = FxMath.calculate(FxMath.number(state[state.currency]), FxMath.number(state.amount), state.currency, FxMath.number(state.buySpread || '0'), FxMath.number(state.sellSpread || '0'), FxMath.number(state.discount || '0'));
    if (!result) {
      output.textContent = '통화의 기준환율과 외화 금액을 입력해 주세요. 환율은 0보다 크게, 금액은 0 이상, 비율은 0~100%로 입력해 주세요.';
      return;
    }
    const labels = { base: '기준환율로 계산', buy: '살 때 · 낼 원화', sell: '팔 때 · 받을 원화' };
    for (const [name, value] of Object.entries(result)) {
      const row = document.createElement('div');
      row.append(document.createTextNode(labels[name]));
      const amount = document.createElement('strong');
      amount.textContent = `${Math.round(value).toLocaleString('ko-KR')}원`;
      row.append(amount);
      output.append(row);
    }
  }
  function importRates(parsed) {
    const currencies = Object.keys(parsed.rates);
    for (const currency of currencies) document.querySelector(`[data-fx="${currency}"]`).value = parsed.rates[currency];
    update();
    status.textContent = currencies.length ? `${currencies.join(' · ')} 기준환율을 채웠어요. 입력된 금액과 JPY 단위를 확인해 주세요.` : '기준환율을 찾지 못했어요. 통화명과 매매기준율 머리글을 포함하거나 안내된 간단한 형식으로 붙여넣어 주세요.';
    if (parsed.skipped.length) status.textContent += ` ${parsed.skipped.join(' · ')}는 기준환율 열을 확인할 수 없어 건너뛰었어요.`;
  }
  // Expand merged bank-table headers so base-rate columns keep their positions.
  function htmlRows(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];
    for (const source of doc.querySelectorAll('table')) {
      const grid = [];
      [...source.rows].forEach((row, y) => {
        grid[y] ||= [];
        let x = 0;
        for (const cell of row.cells) {
          while (grid[y][x] !== undefined) x++;
          const width = Math.min(cell.colSpan || 1, 50);
          const height = Math.min(cell.rowSpan || 1, 50);
          for (let dy = 0; dy < height; dy++) {
            grid[y + dy] ||= [];
            for (let dx = 0; dx < width; dx++) grid[y + dy][x + dx] = cell.textContent.trim();
          }
          x += width;
        }
      });
      rows.push(...grid.map(row => Array.from(row, cell => cell || '')));
    }
    return rows;
  }
  table.addEventListener('paste', event => {
    const text = event.clipboardData.getData('text/plain');
    const html = event.clipboardData.getData('text/html');
    event.preventDefault();
    table.value = text;
    const rows = html ? htmlRows(html) : [];
    importRates(rows.length ? FxMath.parseRows(rows) : FxMath.parseText(text));
  });
  document.getElementById('fx-import').addEventListener('click', () => importRates(FxMath.parseText(table.value)));
  update();
})();
