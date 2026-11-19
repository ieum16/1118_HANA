const feed = new URL('https://news.google.com/rss/search');
feed.search = new URLSearchParams({
  q: '"리트냥이"',
  hl: 'ko',
  gl: 'KR',
  ceid: 'KR:ko',
});

export async function GET() {
  try {
    const upstream = await fetch(feed, { signal: AbortSignal.timeout(7000) });
    if (!upstream.ok) throw new Error('News feed unavailable');
    const xml = await upstream.text();
    if (!/<rss\b/i.test(xml) || xml.length > 2_000_000) {
      throw new Error('Unexpected feed response');
    }

    return new Response(xml, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=0, s-maxage=60',
      },
    });
  } catch {
    return new Response('News feed unavailable', { status: 502 });
  }
}
