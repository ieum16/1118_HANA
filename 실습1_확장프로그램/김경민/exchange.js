(() => {
  const storageKey = 'todo-extension.exchange';
  const panel = document.querySelector('#exchange');
  const element = (id) => panel.querySelector(`#fx-${id}`);
  const currency = element('currency');
  const amount = element('amount');
  const paste = element('paste');
  const rates = Object.fromEntries(Object.keys(exchangeUnits).map((code) => [code, element(code.toLowerCase())]));
  const spreads = { buySpread: element('buy-spread'), sellSpread: element('sell-spread'), discount: element('discount') };
  const baseResult = element('base-result');
  const buyResult = element('buy-result');
  const sellResult = element('sell-result');
  const buyRow = element('buy-row');
  const sellRow = element('sell-row');
  const error = element('error');
  const storageError = element('storage-error');
  const importStatus = element('import-status');
  const optionsCurrency = element('options-currency');
  const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
  const formatWon = (value) => `${won.format(value)}원`;

  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    storageError.textContent = '저장한 환율 계산기 입력값을 불러오지 못했어요.';
    storageError.hidden = false;
  }
  const text = (value) => typeof value === 'string' ? value : '';
  const settings = Object.fromEntries(Object.keys(rates).map((code) => [code, {
    buySpread: text(saved?.settings?.[code]?.buySpread),
    sellSpread: text(saved?.settings?.[code]?.sellSpread),
    discount: text(saved?.settings?.[code]?.discount),
  }]));
  currency.value = Object.hasOwn(rates, saved?.currency) ? saved.currency : 'USD';
  amount.value = text(saved?.amount);
  paste.value = text(saved?.paste);
  for (const [code, input] of Object.entries(rates)) input.value = text(saved?.rates?.[code]);

  function save() {
    const data = {
      currency: currency.value,
      amount: amount.value,
      rates: Object.fromEntries(Object.entries(rates).map(([code, input]) => [code, input.value])),
      settings,
      paste: paste.value,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      storageError.hidden = true;
    } catch {
      storageError.textContent = '환율 계산기 입력값을 저장하지 못했어요.';
      storageError.hidden = false;
    }
  }

  function showSettings() {
    optionsCurrency.textContent = currency.value;
    for (const [key, input] of Object.entries(spreads)) input.value = settings[currency.value][key];
  }

  function render() {
    let invalidNumber = false;
    let invalidPercent = false;
    function validated(input, parse, isPercent = false) {
      const value = parse(input.value);
      if (input.value.trim() && value === null) {
        input.setAttribute('aria-invalid', 'true');
        if (isPercent) invalidPercent = true;
        else invalidNumber = true;
      } else {
        input.removeAttribute('aria-invalid');
      }
      return value;
    }

    const reference = Object.fromEntries(Object.entries(rates).map(([code, input]) => [code, validated(input, readFxRate)]));
    const foreign = validated(amount, readFxNumber);
    const buySpread = validated(spreads.buySpread, readFxPercent, true);
    const sellSpread = validated(spreads.sellSpread, readFxPercent, true);
    const discount = validated(spreads.discount, readFxPercent, true);
    const discountValid = discount !== null || !spreads.discount.value.trim();
    const rate = reference[currency.value];
    const result = rate === null || foreign === null ? {} : calculateWon(
      currency.value, foreign, rate,
      discountValid ? buySpread : null,
      discountValid ? (spreads.sellSpread.value.trim() ? sellSpread : buySpread) : null,
      discount ?? 0,
    );

    let outOfRange = false;
    for (const [key, output] of [['base', baseResult], ['buy', buyResult], ['sell', sellResult]]) {
      const value = result[key];
      const available = Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER;
      if (value != null && !available) outOfRange = true;
      output.textContent = available ? formatWon(value) : '—';
    }
    buyRow.hidden = !spreads.buySpread.value.trim();
    sellRow.hidden = !spreads.sellSpread.value.trim() && buyRow.hidden;
    error.textContent = [
      invalidNumber && '기준환율은 0보다 큰 숫자, 외화 금액은 0 이상의 숫자로 입력하세요.',
      invalidPercent && '스프레드와 우대율은 0~100% 사이로 입력하세요.',
      outOfRange && '환산 금액이 표시 가능한 범위를 넘었어요.',
    ].filter(Boolean).join(' ');
    error.hidden = !error.textContent;
  }

  function showImportStatus(message) {
    importStatus.textContent = message;
    importStatus.hidden = false;
  }

  function applyRates(imported) {
    if (!imported.size) {
      showImportStatus('가져올 기준환율을 찾지 못했어요. 통화와 매매기준율 열을 함께 복사해 주세요.');
      return;
    }
    const withSpread = [];
    for (const [code, values] of imported) {
      rates[code].value = String(values.rate);
      for (const key of ['buySpread', 'sellSpread']) {
        if (values[key] !== undefined) settings[code][key] = String(values[key]);
      }
      if (values.buySpread !== undefined || values.sellSpread !== undefined) withSpread.push(code);
    }
    showSettings();
    render();
    const spreadMessage = withSpread.length ? ` 스프레드도 적용했어요 (${withSpread.join(' · ')}).` : '';
    showImportStatus(`${[...imported.keys()].join(' · ')} 기준환율을 적용했어요.${spreadMessage}`);
  }

  panel.addEventListener('input', (event) => {
    const input = event.target;
    if (input === currency) showSettings();
    for (const [key, field] of Object.entries(spreads)) {
      if (input === field) settings[currency.value][key] = input.value;
    }
    if (input === paste) importStatus.hidden = true;
    else render();
    save();
  });

  paste.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain');
    const table = html && html.length <= 2_000_000 ? fxClipboardTables(html) : '';
    const tableRates = parseFxTable(table);
    const pasted = tableRates.size ? table : plain;
    if (paste.value.length - (paste.selectionEnd - paste.selectionStart) + pasted.length > paste.maxLength) {
      showImportStatus('환율표가 너무 길어요. 필요한 통화 행과 표 머리글만 복사해 주세요.');
      return;
    }
    paste.setRangeText(pasted, paste.selectionStart, paste.selectionEnd, 'end');
    applyRates(tableRates.size ? tableRates : parseFxTable(plain));
    save();
  });

  element('import').addEventListener('click', () => {
    applyRates(parseFxTable(paste.value));
    save();
  });

  showSettings();
  render();
})();
