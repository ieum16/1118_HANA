globalThis.HanaRates = (() => {
  const endpoint = 'https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do';
  const sourceUrl = 'https://www.kebhana.com/cont/mall/mall15/mall1501/index.jsp';
  const clean = (text) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

  function parse(html) {
    const tables = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
    const rates = {};
    for (const [, table] of tables) {
      const header = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
      if (!header) continue;
      let column = 0;
      let baseColumn = -1;
      for (const cell of header[1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)) {
        if (clean(cell[2]).replace(/\s/g, '') === '매매기준율') baseColumn = column;
        column += Number(cell[1].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || 1);
      }
      if (baseColumn < 0) continue;
      const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '';
      for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => clean(cell[1]));
        const code = cells[0]?.match(/\b(USD|JPY|GBP|CAD|CNY)\b/)?.[1];
        if (!code) continue;
        const rate = Exchange.number(cells[baseColumn]);
        if (!(rate > 0) || !Number.isFinite(rate) || rates[code]) throw new Error('은행 환율표 형식을 확인할 수 없습니다.');
        rates[code] = { rate, unit: code === 'JPY' && /\(\s*100\s*\)/.test(cells[0]) ? 100 : 1 };
      }
    }
    if (Exchange.codes.some((code) => !rates[code])) throw new Error('5개 통화의 기준환율을 모두 찾지 못했습니다.');
    const info = html.match(/<p\b[^>]*class=["'][^"']*txtRateBox[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const text = clean(info || '');
    const publishedAt = text.match(/고시일시\s*:\s*(.*?)(?=조회시각|$)/)?.[1]?.trim();
    if (!publishedAt || !/\d{4}년\d{1,2}월\d{1,2}일/.test(publishedAt)) throw new Error('고시 시각을 확인할 수 없습니다.');
    return { rates, publishedAt, fetchedAt: new Date().toISOString(), sourceUrl };
  }

  async function fetchLatest() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type) => parts.find((entry) => entry.type === type).value;
    const day = `${part('year')}${part('month')}${part('day')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        body: new URLSearchParams({ ajax: 'true', curCd: '', inqStrDt: day, tmpInqStrDt: day, pbldDvCd: '3', pbldSqn: '', inqKindCd: '1' })
      });
      if (!response.ok) throw new Error(`은행 응답 오류 (${response.status})`);
      return parse(await response.text());
    } finally {
      clearTimeout(timeout);
    }
  }
  return Object.freeze({ parse, fetchLatest, sourceUrl });
})();
