/* =========================================================
   Weather App - script.js
   Data: Open-Meteo (https://open-meteo.com), free and no API key needed.
     1. Geocoding API: city name -> latitude / longitude
     2. Forecast API:  latitude / longitude -> current weather + daily forecast
   ========================================================= */

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'; // free, no key
const STORAGE_KEY = 'weather-app';
const DEFAULT_CITY = 'Tunis';

// ---------- DOM elements ----------
const $ = (id) => document.getElementById(id);
const els = {
  form: $('search-form'),
  input: $('city-input'),
  locateBtn: $('locate-btn'),
  status: $('status'),
  recent: $('recent'),
  current: $('current'),
  forecastSection: $('forecast-section'),
  forecast: $('forecast'),
  unitButtons: document.querySelectorAll('.unit-btn'),
};

// ---------- app state ----------
const saved = loadSettings();
const state = {
  unit: saved.unit || 'celsius', // 'celsius' | 'fahrenheit'
  place: null, // { name, latitude, longitude }
  recent: saved.recent || [], // last searched city names
};

/**
 * WMO weather codes (used by Open-Meteo) -> description, day/night icon, theme.
 * https://open-meteo.com/en/docs#weathervariables
 */
const WEATHER_CODES = {
  0: ['Clear sky', '☀️', '🌙', 'clear'],
  1: ['Mainly clear', '🌤️', '🌙', 'clear'],
  2: ['Partly cloudy', '⛅', '☁️', 'cloudy'],
  3: ['Overcast', '☁️', '☁️', 'cloudy'],
  45: ['Fog', '🌫️', '🌫️', 'fog'],
  48: ['Freezing fog', '🌫️', '🌫️', 'fog'],
  51: ['Light drizzle', '🌦️', '🌧️', 'rain'],
  53: ['Drizzle', '🌦️', '🌧️', 'rain'],
  55: ['Heavy drizzle', '🌧️', '🌧️', 'rain'],
  56: ['Freezing drizzle', '🌧️', '🌧️', 'rain'],
  57: ['Heavy freezing drizzle', '🌧️', '🌧️', 'rain'],
  61: ['Light rain', '🌦️', '🌧️', 'rain'],
  63: ['Rain', '🌧️', '🌧️', 'rain'],
  65: ['Heavy rain', '🌧️', '🌧️', 'rain'],
  66: ['Freezing rain', '🌧️', '🌧️', 'rain'],
  67: ['Heavy freezing rain', '🌧️', '🌧️', 'rain'],
  71: ['Light snow', '🌨️', '🌨️', 'snow'],
  73: ['Snow', '🌨️', '🌨️', 'snow'],
  75: ['Heavy snow', '❄️', '❄️', 'snow'],
  77: ['Snow grains', '🌨️', '🌨️', 'snow'],
  80: ['Light showers', '🌦️', '🌧️', 'rain'],
  81: ['Showers', '🌧️', '🌧️', 'rain'],
  82: ['Violent showers', '⛈️', '⛈️', 'storm'],
  85: ['Snow showers', '🌨️', '🌨️', 'snow'],
  86: ['Heavy snow showers', '❄️', '❄️', 'snow'],
  95: ['Thunderstorm', '⛈️', '⛈️', 'storm'],
  96: ['Thunderstorm with hail', '⛈️', '⛈️', 'storm'],
  99: ['Severe thunderstorm with hail', '⛈️', '⛈️', 'storm'],
};

function describeWeather(code, isDay = true) {
  const [text, dayIcon, nightIcon, theme] = WEATHER_CODES[code] || ['Unknown', '🌡️', '🌡️', 'default'];
  return { text, icon: isDay ? dayIcon : nightIcon, theme };
}

// =========================================================
// API calls
// =========================================================

/** fetch() + JSON parsing + HTTP error check in one place. */
async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error('Network error: check your internet connection and try again.');
  }
  if (!response.ok) {
    throw new Error(`The weather service answered with an error (HTTP ${response.status}).`);
  }
  return response.json();
}

/** City name -> { name, latitude, longitude }. Throws if the city doesn't exist. */
async function findCity(name) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const data = await getJson(url);
  if (!data.results || data.results.length === 0) {
    throw new Error(`No city found for "${name}". Check the spelling and try again.`);
  }
  const city = data.results[0];
  const region = [city.admin1, city.country].filter(Boolean).filter((part) => part !== city.name);
  return {
    name: [city.name, ...region].join(', '),
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

/** Coordinates -> current weather + 6 days of daily forecast (today + 5). */
async function getWeather({ latitude, longitude }, unit) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto', // times and days in the city's own time zone
    forecast_days: '6',
    temperature_unit: unit,
    wind_speed_unit: unit === 'fahrenheit' ? 'mph' : 'kmh',
    precipitation_unit: unit === 'fahrenheit' ? 'inch' : 'mm',
  });
  return getJson(`${FORECAST_URL}?${params}`);
}

/** Coordinates -> readable place name (used with "Use my location"). */
async function nameFromCoordinates(latitude, longitude) {
  try {
    const data = await getJson(`${REVERSE_GEOCODING_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
    const city = data.city || data.locality;
    return [city, data.countryName].filter(Boolean).join(', ') || 'Your location';
  } catch {
    return 'Your location'; // the name is a nice-to-have; the weather still loads
  }
}

// =========================================================
// Rendering
// =========================================================

function setStatus(message = '', type = '') {
  els.status.textContent = message;
  els.status.className = `status${type ? ` is-${type}` : ''}`;
}

function setLoading(isLoading) {
  els.form.querySelectorAll('button').forEach((btn) => { btn.disabled = isLoading; });
  if (isLoading) setStatus('Loading weather…', 'loading');
}

function formatLocalTime(isoTime) {
  // isoTime is already in the city's time zone ("2026-11-25T18:30"), so it's formatted as-is
  const date = new Date(isoTime);
  return date.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function dayName(isoDate) {
  return new Date(`${isoDate}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' });
}

function renderWeather(place, data) {
  const { current, current_units: units, daily } = data;
  const weather = describeWeather(current.weather_code, current.is_day === 1);
  const unitSymbol = state.unit === 'fahrenheit' ? '°F' : '°C';

  // background theme follows the weather (and day/night for clear skies)
  const theme = weather.theme === 'clear' ? (current.is_day ? 'clear-day' : 'clear-night') : weather.theme;
  document.body.className = `theme-${theme}`;
  document.title = `${Math.round(current.temperature_2m)}${unitSymbol} ${place.name} | Weather App`;

  // current weather (textContent everywhere: API text is never injected as HTML)
  $('location-name').textContent = place.name;
  $('local-time').textContent = `Local time: ${formatLocalTime(current.time)}`;
  $('current-icon').textContent = weather.icon;
  $('current-temp').textContent = Math.round(current.temperature_2m);
  $('temp-unit').textContent = unitSymbol;
  $('current-desc').textContent = weather.text;
  $('high-low').textContent =
    `H: ${Math.round(daily.temperature_2m_max[0])}°  L: ${Math.round(daily.temperature_2m_min[0])}°`;
  $('feels-like').textContent = `${Math.round(current.apparent_temperature)}${unitSymbol}`;
  $('humidity').textContent = `${current.relative_humidity_2m} %`;
  $('wind').textContent = `${Math.round(current.wind_speed_10m)} ${units.wind_speed_10m}`;
  $('precipitation').textContent = `${current.precipitation} ${units.precipitation}`;

  // next 5 days (index 0 is today, already shown above)
  els.forecast.replaceChildren(
    ...daily.time.slice(1, 6).map((date, i) => {
      const day = describeWeather(daily.weather_code[i + 1]);
      const li = document.createElement('li');
      li.className = 'forecast-day';
      li.innerHTML = `
        <span class="forecast-name"></span>
        <span class="forecast-icon" aria-hidden="true"></span>
        <span class="forecast-desc"></span>
        <span class="forecast-temps"><span class="max"></span><span class="min"></span></span>`;
      li.querySelector('.forecast-name').textContent = dayName(date);
      li.querySelector('.forecast-icon').textContent = day.icon;
      li.querySelector('.forecast-desc').textContent = day.text;
      li.querySelector('.max').textContent = `${Math.round(daily.temperature_2m_max[i + 1])}°`;
      li.querySelector('.min').textContent = `${Math.round(daily.temperature_2m_min[i + 1])}°`;
      return li;
    }),
  );

  els.current.hidden = false;
  els.forecastSection.hidden = false;
}

function renderRecent() {
  els.recent.replaceChildren(
    ...state.recent.map((city) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = city;
      chip.addEventListener('click', () => searchCity(city));
      return chip;
    }),
  );
}

function renderUnitButtons() {
  els.unitButtons.forEach((btn) => {
    const active = btn.dataset.unit === state.unit;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

// =========================================================
// Actions
// =========================================================

/** Loads and shows the weather for a place we already have coordinates for. */
async function showWeather(place) {
  setLoading(true);
  try {
    const data = await getWeather(place, state.unit);
    state.place = place;
    renderWeather(place, data);
    setStatus('');
    saveSettings();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

/** Main event handler: city name -> coordinates -> weather. */
async function searchCity(name) {
  const query = name.trim();
  if (query.length < 2) {
    setStatus('Please type at least 2 letters.', 'error');
    return;
  }
  setLoading(true);
  try {
    const place = await findCity(query);
    rememberCity(place.name.split(',')[0]);
    await showWeather(place);
    els.input.value = '';
  } catch (error) {
    setStatus(error.message, 'error');
    setLoading(false);
  }
}

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    setStatus('Your browser does not support geolocation.', 'error');
    return;
  }
  setStatus('Finding your location…', 'loading');
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const { latitude, longitude } = coords;
      const name = await nameFromCoordinates(latitude, longitude);
      showWeather({ name, latitude, longitude });
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Search for a city instead.'
        : 'Could not get your location. Search for a city instead.';
      setStatus(message, 'error');
    },
    { timeout: 10000 },
  );
}

function rememberCity(city) {
  state.recent = [city, ...state.recent.filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(0, 5);
  renderRecent();
}

// ---------- localStorage (wrapped: storage can be blocked in private mode) ----------
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unit: state.unit, recent: state.recent, place: state.place }));
  } catch {
    /* ignore: the app still works without saving */
  }
}

// =========================================================
// Event listeners + start-up
// =========================================================

els.form.addEventListener('submit', (event) => {
  event.preventDefault(); // stay on the page instead of reloading it
  searchCity(els.input.value);
});

els.locateBtn.addEventListener('click', useMyLocation);

els.unitButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.unit === state.unit) return;
    state.unit = btn.dataset.unit;
    renderUnitButtons();
    saveSettings();
    if (state.place) showWeather(state.place); // reload in the new unit
  });
});

renderUnitButtons();
renderRecent();

// Show the last place viewed, or a default city on the first visit
if (saved.place) {
  showWeather(saved.place);
} else {
  searchCity(DEFAULT_CITY);
}
