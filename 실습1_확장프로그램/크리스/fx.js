"use strict";

(() => {
  const AMOUNT_KEY = "todayFxUsdAmount";
  const QUOTE_KEY = "todayFxUsdQuote";
  const $ = (id) => document.getElementById("fx-" + id);
  const amount = $("amount");
  const refresh = $("refresh");
  const status = $("status");
  const saveStatus = $("save-status");
  const rateFormat = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
  const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  let quote = null;
  let loading = false;
  let stopped = false;
  let saveQueue = Promise.resolve();
  let saveVersion = 0;

  function setStatus(text, state) {
    status.textContent = text;
    status.dataset.state = state;
  }

  function renderTotals() {
    $("error").textContent = "";
    for (const key of ["buy", "sell"]) $(key + "-result").textContent = "—";
    if (!quote || amount.value === "") return;
    try {
      if (!amount.validity.valid) throw new Error("달러 금액은 0 이상의 숫자로 입력해 주세요.");
      const result = FxCore.totals(amount.value, quote);
      for (const key of ["buy", "sell"]) $(key + "-result").textContent = totalFormat.format(result[key]) + "원";
    } catch (error) { $("error").textContent = error.message; }
  }

  function renderQuote() {
    for (const key of ["base", "buy", "sell"]) $(key + "-rate").textContent = quote ? rateFormat.format(quote[key]) + "원" : "—";
    $("quote-date").textContent = quote ? "고시 기준일: " + quote.quoteDate : "";
    $("fetched-at").textContent = quote ? "마지막 조회: " + timeFormat.format(new Date(quote.fetchedAt)) + " (한국 시간)" : "";
    renderTotals();
  }

  function saveAmount() {
    const snapshot = amount.value;
    const version = ++saveVersion;
    saveStatus.textContent = "금액 저장 중…";
    saveQueue = saveQueue.catch(() => {}).then(() => chrome.storage.local.set({ [AMOUNT_KEY]: snapshot }));
    saveQueue.then(() => { if (version === saveVersion) saveStatus.textContent = "달러 금액이 저장됐어요."; }, () => {
      if (version === saveVersion) saveStatus.textContent = "금액을 저장하지 못했어요. 다시 입력해 주세요.";
    });
  }

  async function updateQuote() {
    if (loading || stopped) return;
    loading = true;
    refresh.disabled = true;
    setStatus(quote ? "최신 환율 조회 중 · 이전 조회값을 표시하고 있어요." : "최신 환율을 조회하고 있어요…", quote ? "cached" : "loading");
    try {
      const latest = await FxCore.fetchQuote();
      if (stopped) return;
      if (quote && latest.quoteDate < quote.quoteDate) throw new Error("이전 날짜의 응답을 받았어요.");
      quote = latest;
      renderQuote();
      setStatus("조회 완료 · 네이버에서 받은 최근 하나은행 고시값이에요.", "fresh");
      try { await chrome.storage.local.set({ [QUOTE_KEY]: quote }); }
      catch { saveStatus.textContent = "환율은 조회했지만 저장하지 못했어요."; }
    } catch (error) {
      if (stopped) return;
      console.error("공개 환율 조회 실패", error);
      setStatus(quote ? "조회 실패 · 저장된 이전 환율이에요. 고시 기준일과 마지막 조회 시각을 확인해 주세요."
        : "환율을 불러오지 못했어요. 연결을 확인하고 새로고침을 눌러 주세요.", quote ? "cached" : "error");
      renderQuote();
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  amount.addEventListener("input", () => { renderTotals(); saveAmount(); });
  refresh.addEventListener("click", updateQuote);
  window.addEventListener("pagehide", () => { stopped = true; });

  async function initialize() {
    try {
      const stored = await chrome.storage.local.get([AMOUNT_KEY, QUOTE_KEY, "todayFxCalculator"]);
      // Only the old amount migrates; manual rates must never appear as live data.
      const savedAmount = stored[AMOUNT_KEY] ?? stored.todayFxCalculator?.entries?.USD?.amount;
      if (typeof savedAmount === "string") amount.value = savedAmount;
      if (stored[QUOTE_KEY]) {
        try { quote = FxCore.validateQuote(stored[QUOTE_KEY]); } catch { quote = null; }
      }
    } catch (error) {
      console.error("환율 저장값 불러오기 실패", error);
      saveStatus.textContent = "저장값을 읽지 못했어요. 새로 입력할 수 있어요.";
    }
    renderQuote();
    amount.disabled = false;
    refresh.disabled = false;
    await updateQuote();
    if (!stopped) setInterval(updateQuote, 60000);
  }
  initialize();
})();
