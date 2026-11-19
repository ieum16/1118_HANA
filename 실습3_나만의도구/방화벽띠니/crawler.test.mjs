import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUrl, validateInput, parseFeed, mergeArticles, extractArticle, matchesTerms, extractKeySentences } from './lib/crawler.mjs';

test('reject private addresses, credentials, unexpected schemes and ports', () => {
  for (const url of ['http://example.com', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/', 'https://name:secret@example.com/', 'https://example.com:8888/']) assert.equal(publicUrl(url), null);
  assert.equal(publicUrl('https://finance.yahoo.com/a').hostname, 'finance.yahoo.com');
});
test('validate public search terms instead of accepting arbitrary API query expressions', () => {
  assert.deepEqual(validateInput('005930', null), { ticker: '005930', terms: ['삼성전자', '삼전'] });
  assert.deepEqual(validateInput('035420', '["NAVER","네이버"]'), { ticker: '035420', terms: ['NAVER', '네이버'] });
  assert.throws(() => validateInput('005930', '["domain:internal"]'));
  assert.throws(() => validateInput('UNH', '["UnitedHealth"]'));
  assert.throws(() => validateInput('../secret', '["Example"]'));
});
test('RSS parsing filters stale, future and unsafe articles and decodes XML', () => {
  const now = Date.parse('2026-11-19T06:00:00Z');
  const xml = '<rss><channel>' + [
    ['Good &amp; public', 'https://finance.yahoo.com/a?utm_source=rss', 'Thu, 19 Nov 2026 05:00:00 GMT'],
    ['Old', 'https://example.com/old', 'Tue, 17 Nov 2026 05:00:00 GMT'],
    ['Future', 'https://example.com/future', 'Fri, 20 Nov 2026 05:00:00 GMT'],
    ['Bad', 'javascript:alert(1)', 'Thu, 19 Nov 2026 05:00:00 GMT'],
  ].map(([title, link, date]) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><description><![CDATA[<b>Short description</b>]]></description></item>`).join('') + '</channel></rss>';
  const articles = parseFeed(xml, 'test', now);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'Good & public');
  assert.equal(articles[0].url, 'https://finance.yahoo.com/a');
  assert.equal(articles[0].description, 'Short description');
  assert.throws(() => parseFeed('<html>provider error</html>', 'test', now));
});
test('merge prefers direct links and deduplicates feed headlines', () => {
  const base = { title: 'Example article', publishedAt: '2026-11-19T05:00:00Z' };
  const articles = mergeArticles([[{ ...base, url: 'https://news.google.com/rss/articles/code' }], [{ ...base, url: 'https://finance.yahoo.com/a' }]]);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].url, 'https://finance.yahoo.com/a');
});
test('article extraction uses body paragraphs and excludes ads and scripts', () => {
  const p = 'This is a public example paragraph with enough readable text for article extraction. ';
  const html = `<html><body><header>Navigation</header><article><script>SECRET SCRIPT</script><p>${p.repeat(3)}</p><p>${p.repeat(4)}</p></article></body></html>`;
  const article = extractArticle(html);
  assert.equal(article.status, 'collected');
  assert.ok(article.text.length >= 180 && article.text.length <= 600);
  assert.ok(!article.text.includes('SECRET SCRIPT'));
});
test('paywall metadata and empty bodies do not become fake successful extraction', () => {
  assert.equal(extractArticle('<script type="application/ld+json">{"isAccessibleForFree":false}</script><article><p>preview</p></article>').status, 'restricted');
  assert.equal(extractArticle('<html><body><nav>Links only</nav></body></html>').status, 'unavailable');
});

test('match domestic company aliases and exclude English-only headlines', () => {
  assert.equal(matchesTerms({ title: '삼전 투자 계획 공개', description: '' }, ['삼성전자', '삼전']), true);
  assert.equal(matchesTerms({ title: '네이버 새로운 서비스 발표', description: '' }, ['NAVER', '네이버']), true);
  assert.equal(matchesTerms({ title: 'Samsung announces a product', description: '' }, ['Samsung']), false);
  assert.equal(matchesTerms({ title: 'NAVER announces a product - 한국경제', description: '' }, ['NAVER']), false);
});

test('Korean key sentences are bounded extracts and preserve company abbreviations', () => {
  const source = 'JYP Ent. 주가는 전일 대비 상승한 것으로 확인됐다고 회사 관련 기사가 전했다. 회사는 신규 공연 일정을 발표하고 사업 현황을 설명했다. 투자자들은 다음 실적 발표를 확인할 예정이다.';
  const points = extractKeySentences(source, ['JYP']);
  assert.ok(points.length > 0 && points.length <= 3);
  assert.ok(points.every(p => p.length <= 145));
  assert.ok(points[0].includes('JYP Ent. 주가는'));
  assert.deepEqual(extractKeySentences('삼성전자', ['삼성전자']), []);
});

test('Bing RSS wrapper exposes only a validated HTTPS publisher URL', () => {
  const now = Date.parse('2026-11-19T06:00:00Z');
  const xml = '<rss xmlns:News="urn:news"><channel><item><title>네이버 사업 계획 발표</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.com%2Farticle</link><pubDate>Thu, 19 Nov 2026 05:00:00 GMT</pubDate><News:Source>예시 매체</News:Source></item></channel></rss>';
  const articles = parseFeed(xml, 'Bing', now);
  assert.equal(articles[0].url, 'https://example.com/article');
  assert.equal(articles[0].publisher, '예시 매체');
});
