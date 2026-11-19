export const units = { USD: 1, JPY: 100, EUR: 1 };
export const currencies = Object.keys(units);

const rateUrl = 'https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do';
const seoulDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function readNumber(value) {
  const number = value.normalize('NFKC').trim();
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/u.test(number)) return null;
  const result = Number(number.replaceAll(',', ''));
  return Number.isFinite(result) ? result : null;
}

export function parseHanaQuote(html) {
  // Template contents stay inert. Only numeric rates and publication metadata enter the popup.
  const template = document.createElement('template');
  template.innerHTML = html;
  const publication = template.content.querySelector('.txtRateBox .fl')?.textContent.split('고시일시')[1] ?? '';
  const timestamp = publication.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/u);
  const round = publication.match(/\(\s*(\d+)\s*회차\s*\)/u)?.[1];
  if (!timestamp) throw new Error('Hana publication time missing');

  const rates = {};
  for (const table of template.content.querySelectorAll('.printdiv table')) {
    let rateColumn = 0;
    const headings = Array.from(table.tHead?.rows[0]?.cells ?? []);
    const rateHeading = headings.find(cell => {
      if (cell.textContent.replace(/\s/gu, '') === '매매기준율') return true;
      rateColumn += cell.colSpan;
      return false;
    });
    if (!rateHeading) continue;

    for (const body of table.tBodies) {
      for (const row of body.rows) {
        const code = row.cells[0]?.textContent.match(/\b(USD|JPY|EUR)\b/u)?.[1];
        const rate = readNumber(row.cells[rateColumn]?.textContent ?? '');
        if (code && rate > 0) rates[code] = rate;
      }
    }
    break;
  }

  if (!currencies.every(code => rates[code] > 0)) throw new Error('Hana base rates incomplete');
  const [year, month, day, hour, minute] = timestamp.slice(1).map(part => part.padStart(2, '0'));
  return { rates, publishedAt: `${year}-${month}-${day} ${hour}:${minute}${round ? ` · ${round}회차` : ''}` };
}

export async function fetchHanaQuote() {
  const parts = Object.fromEntries(seoulDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const response = await fetch(rateUrl, {
    method: 'POST',
    body: new URLSearchParams({
      ajax: 'true',
      inqKindCd: '1',
      inqStrDt: `${parts.year}${parts.month}${parts.day}`,
      pbldDvCd: '3',
      curCd: '',
      requestTarget: 'searchContentDiv'
    }),
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Hana rate request failed (${response.status})`);

  const quote = parseHanaQuote(await response.text());
  return { ...quote, fetchedAt: Date.now() };
}
