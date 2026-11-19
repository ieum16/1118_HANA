import { getNews, NewsError } from '../lib/crawler.mjs';

export const maxDuration = 45;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'error', message: 'GET 요청만 지원합니다.' });
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const data = await getNews(url.searchParams.get('symbol'), url.searchParams.get('terms'));
    res.setHeader('Cache-Control', data.stale ? 'no-store' : 'public, max-age=0, s-maxage=600, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    const status = error instanceof NewsError ? error.status : 502;
    res.setHeader('Cache-Control', 'no-store');
    if (status === 429) res.setHeader('Retry-After', '10');
    return res.status(status).json({ status: 'error', message: error instanceof NewsError ? error.message : '기사 수집에 실패했어요. 잠시 후 다시 시도해 주세요.' });
  }
}
