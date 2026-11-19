import { load } from 'cheerio';
import robotsParser from 'robots-parser';

const USER_AGENT = 'MorningTicker/1.0 (+personal-news-reader)';
const TTL = 10 * 60 * 1000;
const cache = new Map();
const running = new Map();
const robotCache = new Map();
const FEED_HOSTS = ['news.google.com', 'www.bing.com', 'www.hankyung.com', 'www.mk.co.kr', 'www.yna.co.kr'];
const ARTICLE_HOSTS = ['www.hankyung.com', 'www.mk.co.kr', 'www.yna.co.kr'];
const publisherFeeds = [
  ['한국경제 증권', 'https://www.hankyung.com/feed/finance'],
  ['한국경제 IT', 'https://www.hankyung.com/feed/it'],
  ['매일경제 증권', 'https://www.mk.co.kr/rss/50200011/'],
  ['매일경제 기업', 'https://www.mk.co.kr/rss/50100032/'],
  ['연합뉴스 경제', 'https://www.yna.co.kr/rss/economy.xml'],
];
const feedCache = new Map();
const catalog = {
  '005930': ['삼성전자', '삼전'],
  '012450': ['한화에어로스페이스', '한화에어로'],
  '035420': ['NAVER', '네이버'],
  '035900': ['JYP', 'JYP엔터테인먼트', '제이와이피'],
};

export class NewsError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function publicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (url.hostname === 'localhost' || /^\d+(\.\d+){3}$/.test(url.hostname) || url.hostname.includes(':')) return null;
    return url;
  } catch { return null; }
}

export function validateInput(symbol, inputTerms) {
  const ticker = String(symbol || '').trim().toUpperCase();
  if (!/^\d{6}$/.test(ticker)) throw new NewsError('국내 종목코드 6자리를 입력해 주세요.', 400);
  let terms;
  if (inputTerms == null || inputTerms === '') terms = catalog[ticker];
  else {
    try { terms = typeof inputTerms === 'string' ? JSON.parse(inputTerms) : inputTerms; }
    catch { throw new NewsError('검색어 형식이 올바르지 않아요.', 400); }
  }
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 3 || !terms.every(t => typeof t === 'string' && /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 .&'’()·-]{0,79}$/.test(t))) {
    throw new NewsError('회사명 검색어를 1~3개 입력해 주세요.', 400);
  }
  return { ticker, terms: terms.map(t => t.trim()) };
}

function textOnly(value, max = 350) {
  const $ = load(String(value || ''));
  $('script,style').remove();
  return $.root().text().replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parseFeed(xml, provider, now = Date.now()) {
  const $ = load(xml, { xml: true });
  if (!$('rss channel').length) throw new NewsError(`${provider}의 기사 목록 형식을 읽지 못했어요.`);
  return $('channel > item').toArray().flatMap(el => {
    const item = $(el);
    const title = textOnly(item.find('title').first().text(), 600);
    let address = item.find('link').first().text().trim();
    try {
      const wrapper = new URL(address);
      if (['www.bing.com', 'bing.com'].includes(wrapper.hostname) && wrapper.pathname === '/news/apiclick.aspx') address = wrapper.searchParams.get('url') || '';
    } catch { /* Invalid links are rejected below. */ }
    const url = publicUrl(address);
    const date = new Date(item.find('pubDate').first().text());
    if (!title || !url || Number.isNaN(date.getTime()) || now - date.getTime() > 24 * 3600000 || date.getTime() > now + 5 * 60000) return [];
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === '.tsrc' || key === 'guccounter') url.searchParams.delete(key);
    }
    const namedSource = item.children().filter((_, el) => ['source', 'news:source'].includes(el.tagName.toLowerCase())).first().text().trim();
    return [{ title, url: url.href, publisher: namedSource || provider, publishedAt: date.toISOString(), description: textOnly(item.find('description').first().text()), provider }];
  });
}

export function mergeArticles(groups) {
  const names = new Set(), urls = new Set();
  // Prefer direct publisher URLs over Google redirect URLs for duplicate headlines.
  const articles = groups.flat().sort((a, b) => Number(a.url.includes('news.google.com')) - Number(b.url.includes('news.google.com')));
  return articles.filter(a => {
    const key = a.title.replace(/\s+-\s+[^-]+$/, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (urls.has(a.url) || names.has(key)) return false;
    urls.add(a.url); names.add(key); return true;
  }).sort((a, b) => Number(hasDistinctIntro(b)) - Number(hasDistinctIntro(a)) || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 20);
}

function hasDistinctIntro(article) {
  const normalize = value => String(value).replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
  return article.description?.length >= 40 && !normalize(article.description).startsWith(normalize(article.title));
}

async function fetchText(rawUrl, hosts, { timeout = 6000, maxBytes = 2500000, signal } = {}) {
  let url = publicUrl(rawUrl);
  const deadline = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!url || !hosts.includes(url.hostname)) throw new NewsError('수집 대상에 등록되지 않은 기사 주소예요.');
    const response = await fetch(url, {
      signal: combined, redirect: 'manual', credentials: 'omit',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/xml,text/plain;q=0.9' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const destination = response.headers.get('location');
      await response.body?.cancel();
      if (!destination) throw new NewsError('기사 이동 주소가 없어요.');
      url = publicUrl(new URL(destination, url).href);
      continue;
    }
    if (response.status === 404) { await response.body?.cancel(); return { status: 404, text: '' }; }
    if (!response.ok) { await response.body?.cancel(); throw new NewsError(`제공처 응답 오류 (HTTP ${response.status})`); }
    if (!/text|xml|html/.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new NewsError('본문이 텍스트 형식이 아니에요.'); }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0, text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) throw new NewsError('기사 페이지 크기가 수집 범위를 넘었어요.');
        text += decoder.decode(chunk.value, { stream: true });
      }
      return { status: response.status, text: text + decoder.decode(), url: url.href };
    } finally { await reader.cancel().catch(() => {}); }
  }
  throw new NewsError('기사 이동 횟수가 너무 많아요.');
}

async function mayCrawl(rawUrl, signal) {
  const url = publicUrl(rawUrl);
  if (!url || !ARTICLE_HOSTS.includes(url.hostname)) return false;
  const robotUrl = url.origin + '/robots.txt';
  let record = robotCache.get(robotUrl);
  if (!record || record.expires < Date.now()) {
    try {
      const result = await fetchText(robotUrl, ARTICLE_HOSTS, { timeout: 4000, maxBytes: 300000, signal });
      record = { expires: Date.now() + 3600000, rules: result.status === 404 ? null : robotsParser(robotUrl, result.text), unavailable: false };
    } catch { record = { expires: Date.now() + 60000, unavailable: true }; }
    if (robotCache.size >= 40) robotCache.delete(robotCache.keys().next().value);
    robotCache.set(robotUrl, record);
  }
  return !record.unavailable && (!record.rules || record.rules.isAllowed(url.href, 'MorningTicker') !== false);
}

export function matchesTerms(article, terms) {
  const normalize = value => value.toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
  const haystack = normalize(article.title + ' ' + article.description);
  const headline = article.title.replace(/\s+-\s+[^-]+$/, '');
  return /[가-힣]{2}/.test(headline) && terms.some(term => haystack.includes(normalize(term)));
}

export function extractKeySentences(text, terms = []) {
  const protectedText = String(text).replace(/\b(Ent|Inc|Co|Ltd)\.(?=\s)/g, '$1\uE000');
  const sentences = [...new Set(protectedText.split(/(?<=[.!?。])\s+|\n+/u).map(s => s.replace(/\uE000/g, '.').replace(/\s+/g, ' ').trim()).filter(s => s.length >= 20 && /[가-힣]{4}/.test(s) && !/^(무단|저작권|구독|로그인|기사제보|기자\s*=)/.test(s)))];
  const scored = sentences.map((s, index) => ({ s, index, score: terms.some(t => s.toLowerCase().includes(t.toLowerCase())) * 5 + Number(/실적|매출|영업이익|수주|계약|공시|투자|발표|상승|하락|출시/.test(s)) * 2 + Number(/\d/.test(s)) + 1 / (index + 1) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.index - b.index).map(({ s }) => s.length > 145 ? s.slice(0, 142).trim() + '…' : s);
}

export function extractArticle(html, terms = []) {
  const $ = load(html);
  let restricted = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    const inspect = value => {
      if (!value || typeof value !== 'object') return;
      if (value.isAccessibleForFree === false || value.isAccessibleForFree === 'false') restricted = true;
      Object.values(value).forEach(child => { if (typeof child === 'object') inspect(child); });
    };
    try { inspect(JSON.parse($(el).text())); } catch { /* Invalid structured data is ignored. */ }
  });
  if (restricted) return { status: 'restricted', text: '', label: '이용 제한 · 원문에서 확인' };
  $('script,style,noscript,nav,footer,header,aside,form,[aria-hidden="true"],.advertisement,.ad,.newsletter').remove();
  for (const selector of ['#articletxt', '#article-body', '.news_cnt_detail_wrap', '.news_cnt_detail', '.story-news', 'article', '[itemprop="articleBody"]', '.article-body', '.article-content', '.story-body']) {
    const element = $(selector).first();
    let paragraphs = element.find('p').toArray().map(el => $(el).text().replace(/\s+/g, ' ').trim()).filter(p => p.length >= 20 && !/^(subscribe|sign up|advertisement|all rights reserved|read more)/i.test(p));
    if (!paragraphs.length && element.length) {
      const copy = element.clone();
      copy.find('br').replaceWith('\n');
      paragraphs = copy.text().split(/\n+/).map(s => s.trim()).filter(s => s.length >= 20);
    }
    const unique = [...new Set(paragraphs)];
    if (unique.join(' ').length >= 80) return { status: 'collected', text: unique.join('\n\n').slice(0, 600), sentences: extractKeySentences(unique.join('\n\n'), terms), label: '핵심 문장 · 자동 발췌' };
  }
  return { status: 'unavailable', text: '', label: '본문 미수집 · 원문에서 확인' };
}

async function enrich(article, signal, terms) {
  if (!(await mayCrawl(article.url, signal))) return { ...article, crawl: { status: 'not_allowed', text: '', label: '본문 수집 제외 · 원문에서 확인' } };
  try {
    const result = await fetchText(article.url, ARTICLE_HOSTS, { timeout: 5500, signal });
    return { ...article, crawl: result.status === 404 ? { status: 'unavailable', text: '', label: '본문 미수집 · 원문에서 확인' } : extractArticle(result.text, terms) };
  } catch { return { ...article, crawl: { status: 'unavailable', text: '', label: '본문 연결 실패 · 원문에서 확인' } }; }
}

async function collect({ ticker, terms }) {
  const signal = AbortSignal.timeout(28000);
  const google = new URL('https://news.google.com/rss/search');
  google.search = new URLSearchParams({ q: '(' + terms.map(t => '"' + t + '"').join(' OR ') + ') when:1d', hl: 'ko', gl: 'KR', ceid: 'KR:ko' });
  const bing = new URL('https://www.bing.com/news/search');
  bing.search = new URLSearchParams({ q: ticker === '035420' ? '네이버' : terms[0], format: 'rss', mkt: 'ko-KR', setlang: 'ko', sortbydate: '1', qft: 'interval="4"' });
  const sources = [...publisherFeeds, ['Bing 뉴스 한국어', bing.href], ['Google 뉴스 한국어', google.href]];
  const feedResults = await Promise.allSettled(sources.map(async ([name, address]) => {
    if (address.includes('news.google.com') || address.includes('bing.com')) return parseFeed((await fetchText(address, FEED_HOSTS, { signal })).text, name).filter(a => matchesTerms(a, terms));
    let entry = feedCache.get(address);
    if (!entry || entry.expires < Date.now()) {
      const request = fetchText(address, FEED_HOSTS, { timeout: 6000 }).then(r => r.text);
      entry = { expires: Date.now() + 90000, request };
      feedCache.set(address, entry);
      request.catch(() => { if (feedCache.get(address) === entry) feedCache.delete(address); });
    }
    return parseFeed(await entry.request, name).filter(a => matchesTerms(a, terms));
  }));
  const successful = feedResults.filter(r => r.status === 'fulfilled');
  if (!successful.length) throw new NewsError('뉴스 목록을 가져오지 못했어요. 잠시 후 다시 조회해 주세요.');
  const articles = mergeArticles(successful.map(r => r.value)).map(a => ({ ...a, crawl: { status: 'not_attempted', text: '', label: '기사 제목·링크 제공' } }));
  // Crawl a bounded set of direct publisher pages, with at most two requests at once.
  const candidates = articles.map((a, index) => ({ a, index })).filter(({ a }) => ARTICLE_HOSTS.includes(publicUrl(a.url)?.hostname)).slice(0, 8);
  let cursor = 0;
  await Promise.all([0, 1].map(async () => {
    while (cursor < candidates.length && !signal.aborted) {
      const { a, index } = candidates[cursor++];
      articles[index] = await enrich(a, signal, terms);
    }
  }));
  for (const article of articles) {
    const bodySentences = article.crawl.sentences || [];
    const normalize = value => String(value).replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();
    const descriptionIsTitle = normalize(article.description) === normalize(article.title) || normalize(article.description).startsWith(normalize(article.title));
    const introSentences = descriptionIsTitle ? [] : extractKeySentences(article.description, terms).slice(0, 2);
    article.brief = bodySentences.length ? { kind: 'extractive', sentences: bodySentences, label: '핵심 문장 · 자동 발췌' } : introSentences.length ? { kind: 'publisher', sentences: introSentences, label: '매체가 제공한 짧은 소개' } : { kind: 'unavailable', sentences: [], label: '짧은 소개 미확보 · 제목과 링크 제공' };
  }
  // Put articles with genuinely available short text first, then newest first.
  articles.sort((a, b) => Number(b.brief.sentences.length > 0) - Number(a.brief.sentences.length > 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
  return { status: 'ok', market: 'KR', symbol: ticker, fetchedAt: new Date().toISOString(), periodHours: 24, articles, bodyCount: articles.filter(a => a.crawl.status === 'collected').length, briefCount: articles.filter(a => a.brief.sentences.length).length, sources: feedResults.flatMap((r, i) => r.status === 'fulfilled' ? [sources[i][0]] : []), partial: successful.length < sources.length, stale: false };
}

export async function getNews(symbol, terms) {
  const input = validateInput(symbol, terms);
  const key = JSON.stringify(input);
  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < TTL) return { ...existing.data, cached: true };
  if (running.has(key)) return running.get(key);
  if (running.size >= 3) throw new NewsError('다른 기사 수집을 처리 중이에요. 잠시 후 다시 눌러 주세요.', 429);
  const request = collect(input).then(data => {
    if (cache.size >= 50) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), data });
    return data;
  }).catch(error => {
    if (existing && Date.now() - existing.at < 3600000) return { ...existing.data, stale: true, warning: '새 수집에 실패해 마지막 저장 결과를 표시합니다.' };
    throw error;
  }).finally(() => running.delete(key));
  running.set(key, request);
  return request;
}
