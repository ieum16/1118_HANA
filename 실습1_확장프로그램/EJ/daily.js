const citySelect = document.querySelector('#weather-city');
const weatherBox = document.querySelector('#weather');
const weatherMessage = document.querySelector('#weather-message');
const ratesBox = document.querySelector('#rates');
const ratesButton = document.querySelector('#refresh-rates');
const weatherButton = document.querySelector('#refresh-weather');
const cities = {
  seoul: [37.5665, 126.978], busan: [35.1796, 129.0756],
  incheon: [37.4563, 126.7052], daegu: [35.8714, 128.6014],
  daejeon: [36.3504, 127.3845], gwangju: [35.1595, 126.8526],
  ulsan: [35.5384, 129.3114], suwon: [37.2636, 127.0286],
  chuncheon: [37.8813, 127.73], gangneung: [37.7519, 128.8761],
  cheongju: [36.6424, 127.489], jeonju: [35.8242, 127.148],
  jeju: [33.4996, 126.5312]
};
const cacheDuration = 30 * 60 * 1000;
let weatherRequest = 0;

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function readCache(key) {
  try {
    const saved = await chrome.storage.local.get(key);
    return saved[key];
  } catch {
    return null;
  }
}

async function writeCache(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    // Network results remain visible if cache storage is unavailable.
  }
}

function isFresh(cache) {
  const age = Date.now() - cache.savedAt;
  return age >= 0 && age < cacheDuration;
}

function checkedAt(timestamp) {
  return new Date(timestamp).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function addParagraph(container, text, className = '') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  container.append(paragraph);
}

function validRates(data) {
  return Array.isArray(data) && ['USD', 'JPY'].every(currency =>
    data.some(rate => rate.base === 'KRW' && rate.quote === currency &&
      Number.isFinite(rate.rate) && rate.rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(rate.date)));
}

function showRates(cache, stale = false) {
  ratesBox.replaceChildren();
  for (const [currency, amount] of [['USD', 1], ['JPY', 100]]) {
    const rate = cache.data.find(item => item.quote === currency);
    const line = document.createElement('p');
    line.className = 'rate-line';
    const label = document.createElement('span');
    label.textContent = `${amount} ${currency}`;
    const value = document.createElement('strong');
    value.textContent = `${(amount / rate.rate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`;
    line.append(label, value);
    ratesBox.append(line);
    addParagraph(ratesBox, `${currency} 기준일 ${rate.date}`, 'daily-note');
  }
  addParagraph(ratesBox, `${stale ? '갱신 실패 · 이전 저장 정보' : '확인'} ${checkedAt(cache.savedAt)} (한국 시간)`, 'daily-note');
}

async function loadRates(force = false) {
  ratesButton.disabled = true;
  const cache = await readCache('dailyRates');
  const usableCache = cache && validRates(cache.data) && Number.isFinite(cache.savedAt);
  if (usableCache) showRates(cache, !isFresh(cache));
  if (!force && usableCache && isFresh(cache)) {
    ratesButton.disabled = false;
    return;
  }
  try {
    const data = await fetchJson('https://api.frankfurter.dev/v2/rates?base=KRW&quotes=USD,JPY');
    if (!validRates(data)) throw new Error('Invalid rates');
    const result = { data, savedAt: Date.now() };
    showRates(result);
    await writeCache('dailyRates', result);
  } catch {
    if (usableCache) showRates(cache, true);
    else ratesBox.textContent = '환율을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
  } finally {
    ratesButton.disabled = false;
  }
}

function weatherDescription(code) {
  if (code === 0) return '☀️ 맑음';
  if ([1, 2].includes(code)) return '🌤️ 구름 조금';
  if (code === 3) return '☁️ 흐림';
  if ([45, 48].includes(code)) return '🌫️ 안개';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️ 이슬비';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️ 비';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️ 눈';
  if ([95, 96, 99].includes(code)) return '⛈️ 뇌우';
  return '날씨 정보';
}

function validWeather(data) {
  return data && Number.isFinite(data.current?.temperature_2m) &&
    Number.isFinite(data.current?.weather_code) &&
    typeof data.current.time === 'string' &&
    typeof data.daily?.time?.[0] === 'string' &&
    Number.isFinite(data.daily?.temperature_2m_min?.[0]) &&
    Number.isFinite(data.daily?.temperature_2m_max?.[0]);
}

function showWeather(cache, stale = false) {
  const data = cache.data;
  weatherBox.replaceChildren();
  addParagraph(weatherBox, `${weatherDescription(data.current.weather_code)} ${Math.round(data.current.temperature_2m)}°C`, 'weather-summary');
  addParagraph(weatherBox, `최저 ${Math.round(data.daily.temperature_2m_min[0])}° · 최고 ${Math.round(data.daily.temperature_2m_max[0])}°`);
  addParagraph(weatherBox, `예보일 ${data.daily.time[0]} · 현재값 ${data.current.time.replace('T', ' ')} (한국 시간)`, 'daily-note');
  addParagraph(weatherBox, `${stale ? '갱신 실패 · 이전 저장 정보' : '확인'} ${checkedAt(cache.savedAt)}`, 'daily-note');
}

async function loadWeather(force = false) {
  const request = ++weatherRequest;
  const city = citySelect.value;
  weatherButton.disabled = true;
  weatherBox.textContent = '날씨를 불러오는 중…';
  const key = 'dailyWeather_' + city;
  const cache = await readCache(key);
  if (request !== weatherRequest) return;
  const usableCache = cache && validWeather(cache.data) && Number.isFinite(cache.savedAt);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const fresh = usableCache && isFresh(cache) && cache.data.daily.time[0] === today;
  if (usableCache) showWeather(cache, !fresh);
  if (!force && fresh) {
    weatherButton.disabled = false;
    return;
  }
  try {
    const [latitude, longitude] = cities[city];
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude, longitude, current: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Seoul', forecast_days: '1'
    });
    const data = await fetchJson(url);
    if (!validWeather(data)) throw new Error('Invalid weather');
    const result = { data, savedAt: Date.now() };
    if (request === weatherRequest) showWeather(result);
    await writeCache(key, result);
  } catch {
    if (request !== weatherRequest) return;
    if (usableCache) showWeather(cache, true);
    else weatherBox.textContent = '날씨를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
  } finally {
    if (request === weatherRequest) weatherButton.disabled = false;
  }
}

citySelect.addEventListener('change', () => {
  weatherMessage.textContent = '';
  chrome.storage.local.set({ weatherCity: citySelect.value }).catch(() => {
    weatherMessage.textContent = '지역을 저장하지 못했어요. 다시 선택해 주세요.';
  });
  loadWeather();
});
ratesButton.addEventListener('click', () => loadRates(true));
weatherButton.addEventListener('click', () => loadWeather(true));

async function initializeDaily() {
  const city = await readCache('weatherCity');
  if (Object.hasOwn(cities, city)) citySelect.value = city;
  loadWeather();
}

loadRates();
initializeDaily();
