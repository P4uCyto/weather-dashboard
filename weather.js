// ============================================================
//  WEATHER DASHBOARD — weather.js
//  Replace YOUR_API_KEY_HERE with your free key from:
//  https://openweathermap.org/api → "API keys" tab
// ============================================================

const API_KEY = 'YOUR_API_KEY_HERE';
const BASE    = 'https://api.openweathermap.org/data/2.5';

// ─── STATE ───────────────────────────────────────────────────
let currentUnit = 'metric';   // 'metric' (°C) or 'imperial' (°F)
let lastCity    = '';          // remember the last searched city

// ─── DOM REFERENCES ──────────────────────────────────────────
const searchForm    = document.getElementById('search-form');
const cityInput     = document.getElementById('city-input');
const emptyState    = document.getElementById('empty-state');
const errorState    = document.getElementById('error-state');
const loadingState  = document.getElementById('loading-state');
const weatherContent= document.getElementById('weather-content');
const apiNotice     = document.getElementById('api-notice');


// ─── ENTRY POINT ─────────────────────────────────────────────

// Show the API notice if the key hasn't been set
if (API_KEY === 'YOUR_API_KEY_HERE') {
  apiNotice.classList.add('show');
}

// Listen for form submit
searchForm.addEventListener('submit', handleSearch);

// Load last searched city from localStorage on page open
const savedCity = localStorage.getItem('weather_last_city');
if (savedCity) {
  cityInput.value = savedCity;
  fetchWeather(savedCity);
}


// ─── EVENT HANDLERS ──────────────────────────────────────────

function handleSearch(event) {
  event.preventDefault();  // stop page reload!
  const city = cityInput.value.trim();
  if (!city) return;
  fetchWeather(city);
}

function setUnit(unit) {
  if (unit === currentUnit) return;
  currentUnit = unit;

  // Update button styles
  document.getElementById('btn-c').classList.toggle('active', unit === 'metric');
  document.getElementById('btn-f').classList.toggle('active', unit === 'imperial');

  // Re-fetch with new unit if we have a city
  if (lastCity) fetchWeather(lastCity);
}


// ─── MAIN FETCH FUNCTION ─────────────────────────────────────

async function fetchWeather(city) {
  lastCity = city;
  localStorage.setItem('weather_last_city', city);  // remember it

  showState('loading');

  try {
    // Run both API calls in parallel — faster than sequential awaits
    const [currentData, forecastData] = await Promise.all([
      fetchCurrentWeather(city),
      fetchForecast(city)
    ]);

    renderCurrent(currentData);
    renderForecast(forecastData);
    showState('weather');

  } catch (error) {
    showError(error.message);
  }
}


// ─── API CALLS ───────────────────────────────────────────────

async function fetchCurrentWeather(city) {
  const url = `${BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${currentUnit}`;
  const res  = await fetch(url);

  if (!res.ok) {
    // Translate HTTP status codes into friendly messages
    if (res.status === 404) throw new Error(`City "${city}" not found. Check the spelling.`);
    if (res.status === 401) throw new Error('Invalid API key. Check your key in weather.js.');
    if (res.status === 429) throw new Error('Too many requests. Wait a moment and try again.');
    throw new Error(`Unexpected error (${res.status}). Please try again.`);
  }

  return res.json();
}

async function fetchForecast(city) {
  const url = `${BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${currentUnit}&cnt=40`;
  const res  = await fetch(url);

  if (!res.ok) throw new Error(`Forecast fetch failed (${res.status})`);
  return res.json();
}


// ─── RENDER CURRENT WEATHER ──────────────────────────────────

function renderCurrent(data) {
  // Destructure everything we need from the API response
  const {
    name,
    sys: { country, sunrise, sunset },
    main: { temp, feels_like, temp_min, temp_max, humidity, pressure },
    weather: [{ description, icon }],
    wind: { speed },
    visibility
  } = data;

  const unit     = currentUnit === 'metric' ? '°C' : '°F';
  const windUnit = currentUnit === 'metric' ? 'm/s' : 'mph';

  // Location
  setText('city-name', name);
  setText('city-meta', `${country} · ${formatDateTime(data.dt, data.timezone)}`);

  // Temperature
  setText('temp-main',  `${Math.round(temp)}${unit}`);
  setText('temp-hi',    `${Math.round(temp_max)}${unit}`);
  setText('temp-lo',    `${Math.round(temp_min)}${unit}`);

  // Condition + icon
  setText('condition-text', description);
  const iconEl = document.getElementById('weather-icon');
  iconEl.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
  iconEl.alt = description;

  // Stats
  setText('stat-feels',      `${Math.round(feels_like)}${unit}`);
  setText('stat-humidity',   `${humidity}%`);
  setText('stat-wind',       `${Math.round(speed)} ${windUnit}`);
  setText('stat-visibility', visibility ? `${(visibility / 1000).toFixed(1)} km` : '—');
  setText('stat-uv',         '—');  // UV needs a separate API call; left as exercise
  setText('stat-pressure',   `${pressure} hPa`);

  // Sunrise / sunset
  const srTime = formatTime(sunrise, data.timezone);
  const ssTime = formatTime(sunset,  data.timezone);
  setText('stat-sunrise', srTime);
  setText('stat-sunset',  ssTime);

  // Sun progress bar
  const now    = Date.now() / 1000 + data.timezone - (new Date().getTimezoneOffset() * 60);
  const srSec  = sunrise  + data.timezone - (new Date().getTimezoneOffset() * 60);
  const ssSec  = sunset   + data.timezone - (new Date().getTimezoneOffset() * 60);
  const progress = Math.max(0, Math.min(1, (now - srSec) / (ssSec - srSec)));
  const pct = (progress * 100).toFixed(1);

  document.getElementById('sun-progress').style.width  = `${pct}%`;
  document.getElementById('sun-dot').style.left        = `${pct}%`;

  // Last updated
  setText('last-updated', `Last updated ${new Date().toLocaleTimeString()}`);
}


// ─── RENDER FORECAST ─────────────────────────────────────────

function renderForecast(data) {
  // OpenWeatherMap /forecast gives readings every 3 hours.
  // We group by day and pick the noon reading (or closest).

  const dailyMap = {};

  data.list.forEach(item => {
    const date = new Date((item.dt + data.city.timezone) * 1000 - new Date().getTimezoneOffset() * 60000);
    const dayKey = date.toISOString().slice(0, 10);  // "YYYY-MM-DD"
    const hour   = date.getUTCHours();

    if (!dailyMap[dayKey]) {
      dailyMap[dayKey] = { items: [], noon: null };
    }

    dailyMap[dayKey].items.push(item);

    // Prefer the reading closest to noon (12:00)
    if (!dailyMap[dayKey].noon || Math.abs(hour - 12) < Math.abs(dailyMap[dayKey].noonHour - 12)) {
      dailyMap[dayKey].noon     = item;
      dailyMap[dayKey].noonHour = hour;
    }
  });

  // Take the next 5 days (skip today if we have enough)
  const days = Object.entries(dailyMap).slice(0, 5);

  const unit = currentUnit === 'metric' ? '°C' : '°F';

  const forecastGrid = document.getElementById('forecast-grid');
  forecastGrid.innerHTML = '';

  days.forEach(([dateKey, dayData]) => {
    const rep    = dayData.noon || dayData.items[0];
    const temps  = dayData.items.map(i => i.main.temp);
    const maxT   = Math.round(Math.max(...temps));
    const minT   = Math.round(Math.min(...temps));
    const rain   = dayData.items.reduce((sum, i) => sum + (i.pop || 0), 0) / dayData.items.length;
    const { description, icon } = rep.weather[0];

    const date    = new Date(dateKey + 'T12:00:00');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <span class="forecast-day">${dayName}</span>
      <img
        class="forecast-icon"
        src="https://openweathermap.org/img/wn/${icon}@2x.png"
        alt="${description}"
        loading="lazy"
      >
      <span class="forecast-desc">${description}</span>
      <div class="forecast-temps">
        <span class="forecast-hi">${maxT}${unit}</span>
        <span class="forecast-lo">${minT}${unit}</span>
      </div>
      ${rain > 0.1 ? `<span class="forecast-rain">${Math.round(rain * 100)}% rain</span>` : ''}
    `;

    forecastGrid.appendChild(card);
  });
}


// ─── UI STATE MANAGEMENT ─────────────────────────────────────

function showState(state) {
  emptyState.style.display     = state === 'empty'    ? 'flex'  : 'none';
  errorState.style.display     = state === 'error'    ? 'flex'  : 'none';
  loadingState.style.display   = state === 'loading'  ? 'flex'  : 'none';
  weatherContent.style.display = state === 'weather'  ? 'block' : 'none';
}

function showError(message) {
  document.getElementById('error-title').textContent = message;
  document.getElementById('error-sub').textContent   = 'Try a different city name or check your connection.';
  showState('error');
}


// ─── UTILITY HELPERS ─────────────────────────────────────────

// Shorthand for setting text content
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Format a Unix timestamp + timezone offset to a time string
function formatTime(unixSec, tzOffset) {
  const date = new Date((unixSec + tzOffset) * 1000);
  const h    = date.getUTCHours();
  const m    = String(date.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

// Format Unix timestamp to a readable date+time string
function formatDateTime(unixSec, tzOffset) {
  const date = new Date((unixSec + tzOffset) * 1000);
  return date.toUTCString().slice(0, 16);  // "Mon, 14 Apr 2025"
}
