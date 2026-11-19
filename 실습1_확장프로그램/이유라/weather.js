const weatherCities = {
  seoul: { name: "서울", latitude: 37.5665, longitude: 126.9780 },
  busan: { name: "부산", latitude: 35.1796, longitude: 129.0756 },
  incheon: { name: "인천", latitude: 37.4563, longitude: 126.7052 },
  daegu: { name: "대구", latitude: 35.8714, longitude: 128.6014 },
  daejeon: { name: "대전", latitude: 36.3504, longitude: 127.3845 },
  gwangju: { name: "광주", latitude: 35.1595, longitude: 126.8526 },
  ulsan: { name: "울산", latitude: 35.5384, longitude: 129.3114 },
  jeju: { name: "제주", latitude: 33.4996, longitude: 126.5312 },
};

const weatherCity = document.getElementById("weather-city");
const weatherStatus = document.getElementById("weather-status");
const weatherDetails = document.getElementById("weather-details");
const refreshWeather = document.getElementById("refresh-weather");
const weatherDate = document.getElementById("weather-date");
const temperatureFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
let weatherRequest;

for (const [id, city] of Object.entries(weatherCities)) {
  weatherCity.add(new Option(city.name, id));
}

function weatherDescription(code) {
  if (code === 0) return "맑음";
  if (code === 1 || code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67].includes(code)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([80, 81, 82].includes(code)) return "소나기";
  if ([95, 96, 99].includes(code)) return "뇌우";
  return "날씨 정보 없음";
}

function setWeatherStatus(message) {
  weatherStatus.textContent = message;
  weatherStatus.hidden = !message;
}

function showWeather({ current, daily }) {
  const date = daily?.time?.[0];
  const low = daily?.temperature_2m_min?.[0];
  const high = daily?.temperature_2m_max?.[0];
  const rain = daily?.precipitation_probability_max?.[0];
  const temperature = current?.temperature_2m;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      ![temperature, low, high].every(Number.isFinite)) {
    throw new Error("Invalid weather response");
  }

  document.getElementById("weather-condition").textContent = weatherDescription(current.weather_code);
  document.getElementById("weather-temperature").textContent = `${temperatureFormat.format(temperature)} °C`;
  document.getElementById("weather-low").textContent = `${temperatureFormat.format(low)} °C`;
  document.getElementById("weather-high").textContent = `${temperatureFormat.format(high)} °C`;
  document.getElementById("weather-rain").textContent = Number.isFinite(rain) ? `${rain}%` : "정보 없음";
  weatherDate.dateTime = date;
  weatherDate.textContent = date;
  weatherDetails.hidden = false;
}

async function loadWeather() {
  weatherRequest?.abort();
  const request = new AbortController();
  weatherRequest = request;
  refreshWeather.disabled = true;
  weatherDetails.hidden = true;
  setWeatherStatus("날씨를 불러오는 중이에요.");

  const { latitude, longitude } = weatherCities[weatherCity.value];
  const params = new URLSearchParams({
    latitude, longitude,
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max",
    timezone: "Asia/Seoul",
    forecast_days: "1",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
    const data = await response.json();
    if (request.signal.aborted) return;
    showWeather(data);
    setWeatherStatus("");
  } catch {
    if (!request.signal.aborted) {
      setWeatherStatus("날씨를 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.");
    }
  } finally {
    if (weatherRequest === request) {
      weatherRequest = undefined;
      refreshWeather.disabled = false;
    }
  }
}

weatherCity.disabled = true;
refreshWeather.disabled = true;
chrome.storage.local.get("weatherCity").then(({ weatherCity: savedCity }) => {
  if (Object.hasOwn(weatherCities, savedCity)) weatherCity.value = savedCity;
}).catch(() => {}).finally(() => {
  weatherCity.disabled = false;
  loadWeather();
});

weatherCity.addEventListener("change", () => {
  chrome.storage.local.set({ weatherCity: weatherCity.value }).catch(() => {});
  loadWeather();
});
refreshWeather.addEventListener("click", loadWeather);
