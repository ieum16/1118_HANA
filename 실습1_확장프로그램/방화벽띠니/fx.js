(() => {
  const F = FxCore, $ = id => document.getElementById(id);
  const fields = { amount: 'fxAmount', base: 'fxBase', unit: 'fxUnit', buySpread: 'fxBuySpread', sellSpread: 'fxSellSpread', preference: 'fxPreference' };
  let model = F.defaults(), queue = Promise.resolve(), preview = null, ready = false;
  const current = () => model.currencies[model.selected];
  const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
  function save() {
    const snapshot = structuredClone(model);
    queue = queue.catch(() => {}).then(() => chrome.storage.local.set({ [F.KEY]: snapshot }));
    queue.then(() => { $('fxSaveStatus').textContent = '환율 입력값을 저장했어요.'; }, () => { $('fxSaveStatus').textContent = '환율 저장에 실패했어요. 입력값을 다시 확인해 주세요.'; });
  }
  function calculate() {
    const result = F.calculate(current());
    $('fxValidation').textContent = result.error || '';
    for (const [id, field] of [['fxBaseResult', 'baseTotal'], ['fxBuyResult', 'buyTotal'], ['fxSellResult', 'sellTotal']]) $(id).textContent = result.error ? '—' : won(result[field]);
    $('fxRateDetail').textContent = result.error ? '' : `${current().unit} ${model.selected} 기준 · 살 때 ${result.buyRate.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원 / 팔 때 ${result.sellRate.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}원`;
  }
  function render() {
    const code = model.selected;
    for (const button of document.querySelectorAll('[data-fx-currency]')) button.setAttribute('aria-pressed', String(button.dataset.fxCurrency === code));
    $('fxAmountUnit').textContent = code;
    $('fxUnit').replaceChildren();
    for (const unit of code === 'JPY' ? ['100', '1'] : ['1']) {
      const option = document.createElement('option'); option.value = unit; option.textContent = `${unit} ${code}당`; $('fxUnit').append(option);
    }
    for (const [key, id] of Object.entries(fields)) $(id).value = current()[key];
    calculate();
  }
  // Reconstruct a copied HTML table's row/column spans into a labelled TSV grid.
  function tableText(html) {
    const document = new DOMParser().parseFromString(html, 'text/html'), table = document.querySelector('table');
    if (!table) return null;
    const grid = [];
    for (const [r, row] of [...table.rows].slice(0, 200).entries()) {
      grid[r] ||= []; let column = 0;
      for (const cell of row.cells) {
        while (grid[r][column] !== undefined) column++;
        const text = cell.textContent.replace(/\s+/g, ' ').trim();
        const rows = Math.min(cell.rowSpan || 1, 20), columns = Math.min(cell.colSpan || 1, 30);
        for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) { grid[r + y] ||= []; grid[r + y][column + x] = text; }
        column += columns;
      }
    }
    return grid.map(row => row.join('\t')).join('\n').slice(0, 30000);
  }
  function readTable() {
    preview = F.parseTable($('fxPaste').value);
    $('fxPreviewRows').replaceChildren();
    for (const [code, row] of Object.entries(preview.rows)) {
      const tr = document.createElement('tr');
      for (const value of [code, `${row.base} / ${row.unit}`, row.buySpread ?? '유지', row.sellSpread ?? '유지']) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      $('fxPreviewRows').append(tr);
    }
    const codes = Object.keys(preview.rows);
    $('fxPreview').hidden = codes.length === 0;
    $('fxImportStatus').textContent = [codes.length ? `${codes.join('·')} 값을 확인했어요. 금액과 인식하지 못한 항목은 유지돼요.` : '인식한 환율이 없어요. 매매기준율 제목과 통화 행을 함께 붙여넣어 주세요.', ...preview.warnings].join(' ');
  }
  for (const [key, id] of Object.entries(fields)) $(id).addEventListener('input', () => {
    if (!ready) return;
    current()[key] = $(id).value; calculate(); save();
  });
  for (const button of document.querySelectorAll('[data-fx-currency]')) button.addEventListener('click', () => {
    if (!ready) return; model.selected = button.dataset.fxCurrency; render(); save();
  });
  $('fxPaste').addEventListener('paste', event => {
    const html = event.clipboardData?.getData('text/html'), text = html ? tableText(html) : null;
    if (text) { event.preventDefault(); $('fxPaste').value = text; $('fxPaste').dispatchEvent(new Event('input')); }
  });
  $('fxPaste').addEventListener('input', () => {
    if (!ready) return; model.paste = $('fxPaste').value; preview = null; $('fxPreview').hidden = true; $('fxImportStatus').textContent = ''; save();
  });
  $('fxReadTable').addEventListener('click', () => { if (ready) readTable(); });
  $('fxApplyTable').addEventListener('click', () => {
    if (!ready || !preview) return;
    for (const [code, values] of Object.entries(preview.rows)) Object.assign(model.currencies[code], values);
    render(); save(); $('fxImportStatus').textContent = `${Object.keys(preview.rows).join('·')} 환율을 적용했어요.`;
  });
  (async () => {
    try {
      const data = (await chrome.storage.local.get(F.KEY))[F.KEY];
      if (data) {
        if (F.CODES.includes(data.selected)) model.selected = data.selected;
        model.paste = String(data.paste || '').slice(0, 30000);
        for (const code of F.CODES) for (const key of Object.keys(fields)) {
          if (data.currencies?.[code]?.[key] !== undefined) model.currencies[code][key] = String(data.currencies[code][key]);
        }
      }
      ready = true; $('fxFields').disabled = false; $('fxPaste').value = model.paste; render();
    } catch { $('fxSaveStatus').textContent = '환율 저장소를 열지 못했어요. 확장 프로그램을 다시 열어주세요.'; }
  })();
})();
