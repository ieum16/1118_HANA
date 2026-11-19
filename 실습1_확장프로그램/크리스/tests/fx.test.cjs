const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "fx-core.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "fx.js"), "utf8");
// Public Naver response shape verified on 2026-11-19. Fixture, not live prices.
const fixture = [
  { localTradedAt: "2026-11-19", closePrice: "1,330.20", cashBuyValue: "1,353.47", cashSellValue: "1,306.93", sendValue: "1,343.2", receiveValue: "1,317.2" },
  { localTradedAt: "2026-11-18", closePrice: "1,334.00", cashBuyValue: "1,357.34", cashSellValue: "1,310.66" }
];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function element() {
  return { value: "", textContent: "", disabled: false, validity: { valid: true }, dataset: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; } };
}

async function run() {
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout });
  vm.runInContext(coreSource, context);
  const core = context.FxCore;
  const quote = core.normalize(fixture, "2026-11-19T02:30:00Z");
  assert.equal(quote.buy, 1353.47);
  assert.equal(quote.sell, 1306.93);
  assert.equal(quote.base, 1330.2);
  assert.equal(quote.quoteDate, "2026-11-19");
  assert.equal(core.normalize([...fixture].reverse()).buy, 1353.47);
  const totals = core.totals("100", quote);
  assert.equal(totals.buy, 135347);
  assert.equal(totals.sell, 130693);
  assert.equal(core.totals("0", quote).buy, 0);
  for (const bad of ["", "-1", "abc", "Infinity", "1e309"]) assert.throws(() => core.totals(bad, quote));
  for (const bad of [[], {}, null, [{ ...fixture[0], cashBuyValue: null }], [{ ...fixture[0], closePrice: "1,2" }],
    [{ ...fixture[0], cashSellValue: "2,000" }], [{ ...fixture[0], localTradedAt: "2026-02-30" }]]) {
    assert.throws(() => core.normalize(bad));
  }
  let options;
  const fetched = await core.fetchQuote(async (url, init) => {
    assert.equal(url, core.API_URL); options = init;
    return { ok: true, json: async () => fixture };
  });
  assert.equal(fetched.sell, 1306.93);
  assert.equal(options.credentials, "omit");
  assert.equal(options.cache, "no-store");
  await assert.rejects(() => core.fetchQuote(async () => ({ ok: false, status: 503 })), /503/);
  await assert.rejects(() => core.fetchQuote(async () => ({ ok: true, json: async () => { throw Error("HTML instead of JSON"); } })));
  let timeoutCallback;
  let cleared = false;
  const timeoutContext = vm.createContext({ AbortController, setTimeout: (fn, ms) => { assert.equal(ms, 12000); timeoutCallback = fn; return 1; }, clearTimeout: () => { cleared = true; } });
  vm.runInContext(coreSource, timeoutContext);
  const timeoutPromise = timeoutContext.FxCore.fetchQuote(async (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(Error("timeout")));
  }));
  timeoutCallback();
  await assert.rejects(() => timeoutPromise, /timeout/);
  assert.equal(cleared, true);

  let storage = { todayTodos: [{ id: "untouched", text: "기존 할 일" }], todayFxCalculator: { entries: { USD: { amount: "100", rate: "9999", buy: "50", discount: "90" } } } };
  let fail = false;
  let failSave = false;
  let fetchCount = 0;
  let requestGate = null;
  let apiRows = fixture;
  function open() {
    const ids = ["amount", "refresh", "status", "save-status", "error", "base-rate", "buy-rate", "sell-rate", "quote-date", "fetched-at", "buy-result", "sell-result"];
    const els = Object.fromEntries(ids.map((id) => [id, element()]));
    const intervals = [];
    const windowListeners = {};
    const ctx = vm.createContext({ Intl, Date, AbortController, setTimeout, clearTimeout, console: { error() {} },
      setInterval: (fn, ms) => { intervals.push({ fn, ms }); },
      window: { addEventListener: (event, fn) => { windowListeners[event] = fn; } },
      document: { getElementById: (id) => els[id.replace(/^fx-/, "")] },
      fetch: async () => {
        fetchCount++;
        if (requestGate) await requestGate;
        if (fail) throw Error("offline");
        return { ok: true, json: async () => apiRows };
      },
      chrome: { storage: { local: {
        get: async () => structuredClone(storage),
        set: async (data) => { if (failSave) throw Error("storage failure"); Object.assign(storage, structuredClone(data)); }
      } } }
    });
    vm.runInContext(coreSource, ctx);
    vm.runInContext(uiSource, ctx);
    return { els, intervals, windowListeners };
  }
  let app = open();
  await tick();
  assert.equal(fetchCount, 1);
  assert.equal(app.els.amount.value, "100");
  assert.match(app.els["buy-rate"].textContent, /1,353.47/);
  assert.match(app.els["sell-rate"].textContent, /1,306.93/);
  assert.match(app.els["buy-result"].textContent, /135,347/);
  assert.equal(app.els.status.dataset.state, "fresh");
  assert.match(app.els["quote-date"].textContent, /2026-11-19/);
  assert.equal(app.intervals[0].ms, 60000);
  app.els.amount.value = "200"; app.els.amount.listeners.input();
  app.els.amount.value = "300"; app.els.amount.listeners.input();
  await tick();
  assert.equal(storage.todayFxUsdAmount, "300");
  fail = true;
  app = open();
  await tick();
  assert.equal(app.els.amount.value, "300");
  assert.equal(app.els.status.dataset.state, "cached");
  assert.match(app.els.status.textContent, /이전 환율/);
  assert.match(app.els["buy-rate"].textContent, /1,353.47/);
  fail = false;
  await app.els.refresh.listeners.click();
  assert.equal(app.els.status.dataset.state, "fresh");
  apiRows = [fixture[1]];
  await app.els.refresh.listeners.click();
  assert.equal(app.els.status.dataset.state, "cached");
  assert.match(app.els["quote-date"].textContent, /2026-11-19/);
  apiRows = fixture;
  let release;
  requestGate = new Promise((resolve) => { release = resolve; });
  const before = fetchCount;
  const pending = app.els.refresh.listeners.click();
  await app.els.refresh.listeners.click();
  assert.equal(fetchCount, before + 1); // No overlapping network requests.
  release(); await pending; requestGate = null;
  failSave = true;
  app.els.amount.value = "400"; app.els.amount.listeners.input();
  await tick();
  assert.match(app.els["save-status"].textContent, /저장하지/);
  failSave = false;
  app.els.amount.value = "500"; app.els.amount.listeners.input();
  await tick();
  assert.equal(storage.todayFxUsdAmount, "500");
  app.els.amount.value = "-1"; app.els.amount.listeners.input();
  assert.equal(app.els["buy-result"].textContent, "—");
  assert.ok(app.els.error.textContent);
  await tick();
  app.windowListeners.pagehide();
  const closedCount = fetchCount;
  await app.intervals[0].fn();
  assert.equal(fetchCount, closedCount);
  delete storage.todayFxUsdQuote;
  fail = true;
  app = open();
  await tick();
  assert.equal(app.els.status.dataset.state, "error");
  assert.equal(app.els["buy-rate"].textContent, "—"); // Old manual rates are not live quotes.
  assert.equal(storage.todayTodos[0].id, "untouched");
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  assert.ok(!/id="fx-(discount|buy|sell|table|USD|JPY|EUR)"/.test(html));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).host_permissions[0], "https://api.stock.naver.com/*");
  return "PASS: real API schema fixture, bid/ask mapping, USD totals, validation, HTTP/JSON/timeout failures, amount migration/save/reopen, cache labeling, stale-date rejection, 60-second refresh, overlapping requests, closed popup, todo preservation, removed manual inputs.";
}
module.exports = run;
if (require.main === module) run().then(console.log).catch((error) => { console.error(error); process.exitCode = 1; });
