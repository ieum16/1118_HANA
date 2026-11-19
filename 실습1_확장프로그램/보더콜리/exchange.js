(() => {
  const get = (id) => document.getElementById(id);
  const defaults = () => ({ rate: '', buySpread: '', sellSpread: '', discount: '' });
  let state = { currency: 'USD', amount: '', jpyUnit: '100', table: '', column: 'auto', auto: true, quote: null, source: 'manual', rates: Object.fromEntries(Exchange.codes.map((code) => [code, defaults()])) };
  let revision = 0;
  let rateRevision = 0;
  let fetching = false;

  function showQuote() {
    get('fx-auto').checked = state.auto;
    if (!state.quote) { get('fx-quote').textContent = state.auto ? '하나은행 최신 고시 환율을 조회합니다.' : '직접 입력한 환율을 사용합니다.'; return; }
    const fetched = new Date(state.quote.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    get('fx-quote').textContent = `하나은행 고시 ${state.quote.publishedAt} · 조회 ${fetched} (한국시간)${state.source === 'manual' ? ' · 현재 환율은 직접 입력값' : ''}`;
  }

  function useManualRates() {
    rateRevision++;
    state.auto = false;
    state.source = 'manual';
    showQuote();
    get('fx-live-status').textContent = '직접 입력한 환율을 사용합니다. 자동 갱신을 켜면 하나은행 환율을 적용합니다.';
  }

  async function loadLatest() {
    if (fetching) return;
    fetching = true;
    const startedRevision = rateRevision;
    get('fx-refresh').disabled = true;
    get('fx-live-status').textContent = '하나은행 최신 고시 조회 중…';
    try {
      const quote = await HanaRates.fetchLatest();
      // Keep any manual changes made while the bank request was in progress.
      if (rateRevision !== startedRevision) return;
      for (const code of Exchange.codes) {
        state.rates[code].rate = String(quote.rates[code].rate);
        get(`fx-rate-${code}`).value = state.rates[code].rate;
      }
      state.jpyUnit = String(quote.rates.JPY.unit);
      get('fx-jpy-unit').value = state.jpyUnit;
      state.quote = quote;
      state.source = 'hana';
      showQuote();
      showResult();
      save();
      get('fx-live-status').textContent = '5개 통화의 매매기준율을 적용했습니다.';
    } catch (error) {
      if (rateRevision === startedRevision) {
        get('fx-live-status').textContent = `최신환율 조회에 실패했습니다. 기존 입력값으로 계산합니다. ${error.name === 'AbortError' ? '요청 시간이 초과되었습니다.' : error.message}`;
      }
    } finally {
      fetching = false;
      get('fx-refresh').disabled = false;
      if (state.auto && rateRevision !== startedRevision) loadLatest();
    }
  }

  function showResult() {
    const current = state.rates[state.currency];
    const rate = Exchange.number(current.rate);
    const amount = Exchange.number(state.amount);
    const optional = (value) => value.trim() ? Exchange.number(value) : 0;
    const result = Exchange.calculate(rate, amount, state.currency === 'JPY' ? Number(state.jpyUnit) : 1,
      optional(current.buySpread), optional(current.sellSpread), optional(current.discount));
    const target = get('fx-result');
    target.replaceChildren();
    if (!result) {
      target.textContent = '양수 기준환율, 0 이상의 외화 금액을 입력하세요. 스프레드·우대율은 0~100%로 입력하세요.';
      return;
    }
    const formatter = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
    for (const [label, value] of [['기준환율 환산', result.base], ['외화 살 때 · 낼 원화', result.buy], ['외화 팔 때 · 받을 원화', result.sell]]) {
      const row = document.createElement('div');
      const name = document.createElement('span');
      const total = document.createElement('strong');
      name.textContent = label;
      total.textContent = formatter.format(value);
      row.append(name, total);
      target.append(row);
    }
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = '원 단위 반올림 · 입력한 환율과 수수료 조건으로 계산한 금액';
    target.append(note);
  }

  function save() {
    const currentRevision = ++revision;
    get('fx-save-status').textContent = '저장 중…';
    // Dispatch each write immediately so closing the popup cannot cancel a debounce.
    chrome.storage.local.set({ exchangeState: structuredClone(state) }).then(() => {
      if (currentRevision === revision) get('fx-save-status').textContent = '입력값을 저장했습니다.';
    }).catch(() => {
      if (currentRevision === revision) get('fx-save-status').textContent = '저장하지 못했습니다. 입력값 저장 버튼으로 다시 시도하세요.';
    });
  }

  function renderCurrency() {
    const current = state.rates[state.currency];
    get('fx-buy-spread').value = current.buySpread;
    get('fx-sell-spread').value = current.sellSpread;
    get('fx-discount').value = current.discount;
    showResult();
  }

  async function initialize() {
    const controls = document.querySelectorAll('#exchange input, #exchange select, #exchange textarea, #exchange button');
    controls.forEach((control) => { control.disabled = true; });
    try {
      const stored = (await chrome.storage.local.get('exchangeState')).exchangeState;
      if (stored) {
        state = { ...state, ...stored, rates: Object.fromEntries(Exchange.codes.map((code) => [code, { ...defaults(), ...stored.rates?.[code] }])) };
        if (!Exchange.codes.includes(state.currency)) state.currency = 'USD';
      }
      for (const code of Exchange.codes) {
        const wrapper = document.createElement('div');
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.id = `fx-rate-${code}`;
        input.inputMode = 'decimal';
        input.value = state.rates[code].rate;
        input.placeholder = '기준환율 입력';
        label.htmlFor = input.id;
        label.textContent = `${code} 기준환율`;
        input.addEventListener('input', () => { state.rates[code].rate = input.value; useManualRates(); showResult(); save(); });
        wrapper.append(label, input);
        get('fx-rates').append(wrapper);
      }
      for (const [id, key] of [['fx-currency', 'currency'], ['fx-amount', 'amount'], ['fx-jpy-unit', 'jpyUnit'], ['fx-table', 'table'], ['fx-column', 'column']]) {
        get(id).value = state[key];
        get(id).addEventListener(id === 'fx-table' || id === 'fx-amount' ? 'input' : 'change', () => {
          state[key] = get(id).value;
          if (key === 'jpyUnit') useManualRates();
          if (key === 'currency') renderCurrency();
          else showResult();
          save();
        });
      }
      for (const [id, key] of [['fx-buy-spread', 'buySpread'], ['fx-sell-spread', 'sellSpread'], ['fx-discount', 'discount']]) {
        get(id).addEventListener('input', () => { state.rates[state.currency][key] = get(id).value; showResult(); save(); });
      }
      function applyTable() {
        const parsed = Exchange.parseTable(state.table, state.column);
        const filled = [];
        for (const [code, entry] of Object.entries(parsed.rates)) {
          state.rates[code].rate = String(entry.rate);
          get(`fx-rate-${code}`).value = String(entry.rate);
          if (code === 'JPY' && entry.unit) { state.jpyUnit = String(entry.unit); get('fx-jpy-unit').value = state.jpyUnit; }
          filled.push(`${code} ${entry.rate.toLocaleString('ko-KR', { maximumFractionDigits: 8 })}원`);
        }
        let message = filled.length ? `${filled.join(' · ')} 적용했습니다.` : '인식한 기준환율이 없습니다. 제목 또는 기준환율 위치를 확인하세요.';
        if (parsed.rejected.length) message += ` ${parsed.rejected.join(', ')}는 환율 열이나 중복 행을 확인하세요.`;
        if (filled.length) useManualRates();
        get('fx-import-status').textContent = message;
        showResult();
        save();
      }
      get('fx-import-button').addEventListener('click', applyTable);
      get('fx-table').addEventListener('paste', () => {
        // Let the native paste finish before reading the updated textarea.
        setTimeout(() => { state.table = get('fx-table').value; applyTable(); }, 0);
      });
      get('fx-save').addEventListener('click', save);
      get('fx-refresh').addEventListener('click', loadLatest);
      get('fx-auto').addEventListener('change', () => {
        rateRevision++;
        state.auto = get('fx-auto').checked;
        save();
        if (state.auto) loadLatest();
        else get('fx-live-status').textContent = '자동 갱신을 껐습니다.';
      });
      renderCurrency();
      showQuote();
      document.querySelectorAll('#exchange input, #exchange select, #exchange textarea, #exchange button').forEach((control) => { control.disabled = false; });
      if (state.auto) loadLatest();
      setInterval(() => { if (state.auto) loadLatest(); }, 60000);
    } catch (error) {
      get('fx-save-status').textContent = '환율 입력값을 불러오지 못했습니다. 확장 프로그램을 다시 열어 주세요.';
    }
  }
  initialize();
})();
