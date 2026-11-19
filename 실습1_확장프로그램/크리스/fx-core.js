"use strict";

globalThis.FxCore = (() => {
  const API_URL = "https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?page=1&pageSize=10";

  function positiveRate(value) {
    if (typeof value !== "number" && typeof value !== "string") throw new Error("환율 데이터 형식이 변경됐어요.");
    const text = String(value).trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error("올바른 환율을 받지 못했어요.");
    const rate = Number(text.replace(/,/g, ""));
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("올바른 환율을 받지 못했어요.");
    return rate;
  }

  function validDay(day) {
    return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
      && Number.isFinite(Date.parse(day + "T00:00:00Z"))
      && new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day;
  }

  function validateQuote(quote) {
    if (!quote || !validDay(quote.quoteDate) || !Number.isFinite(Date.parse(quote.fetchedAt))) throw new Error("환율 기준일을 확인하지 못했어요.");
    const base = positiveRate(quote.base);
    const buy = positiveRate(quote.buy);
    const sell = positiveRate(quote.sell);
    if (sell > base || base > buy) throw new Error("매수·매도 환율 데이터가 올바르지 않아요.");
    return { base, buy, sell, quoteDate: quote.quoteDate, fetchedAt: quote.fetchedAt };
  }

  function normalize(payload, fetchedAt = new Date().toISOString()) {
    if (!Array.isArray(payload) || !payload.length || !payload.every((row) => row && validDay(row.localTradedAt))) {
      throw new Error("공개 환율 응답 형식이 변경됐어요.");
    }
    // All prices must come from one complete row, never mixed quote dates.
    const latest = [...payload].sort((a, b) => b.localTradedAt.localeCompare(a.localTradedAt))[0];
    return validateQuote({ base: latest.closePrice, buy: latest.cashBuyValue, sell: latest.cashSellValue,
      quoteDate: latest.localTradedAt, fetchedAt });
  }

  async function fetchQuote(fetcher = fetch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(API_URL, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      if (!response.ok) throw new Error("환율 서버 응답 오류 (" + response.status + ")");
      return normalize(await response.json());
    } finally { clearTimeout(timeout); }
  }

  function totals(amount, quote) {
    const value = String(amount).trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error("달러 금액은 0 이상의 숫자로 입력해 주세요.");
    const dollars = Number(value);
    if (!Number.isFinite(dollars)) throw new Error("달러 금액이 너무 커요.");
    const result = { buy: dollars * quote.buy, sell: dollars * quote.sell };
    if (!Object.values(result).every(Number.isFinite)) throw new Error("달러 금액이 너무 커요.");
    return result;
  }
  return { API_URL, normalize, validateQuote, fetchQuote, totals };
})();
