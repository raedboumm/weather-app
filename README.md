# ⛅ Weather App

A responsive weather app built with **HTML, CSS and vanilla JavaScript**. It fetches live data from the free **[Open-Meteo](https://open-meteo.com/) API**, which needs **no API key and no sign-up**, so the app works as soon as you open `index.html`.

## Features

- 🔎 **Search any city** in the world (Open-Meteo geocoding)
- 🌡️ **Current weather**: temperature, description, icon, feels-like, humidity, wind, precipitation, today's high and low, and the city's local time
- 📅 **5-day forecast** with icons and min/max temperatures
- 📍 **Use my location** button (browser geolocation)
- 🔁 **°C / °F toggle**: wind and precipitation units switch too (km/h ↔ mph, mm ↔ inch)
- 🕘 **Recent searches** as clickable chips, and the last city reopens on the next visit (saved in `localStorage`)
- 🎨 **Background that changes with the weather**: clear day, clear night, cloudy, rain, snow, storm or fog
- ⚠️ **Clear error messages** for an unknown city, no internet connection, an API error or denied location permission
- 📱 **Responsive**: media queries for small phones, tablets and desktops
- ♿ Accessible: labels, `aria-live` status messages, keyboard focus styles, `prefers-reduced-motion`

## Run it

There is nothing to install and no build step.

1. Download or clone the repository.
2. Open **`index.html`** in your browser (double-click it).

## Project structure

```
weather-app/
├── index.html    page structure: header, search form, current weather card, forecast card
├── styles.css    layout, glass-style cards, weather themes, media queries
└── script.js     fetch() calls to the API, JSON parsing, DOM updates, event handlers
```

## How it works

Getting the weather for a city takes **two `fetch()` calls**:

```js
// 1. City name -> coordinates (Geocoding API)
const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
const { results } = await geo.json();          // [{ name, country, latitude, longitude }]

// 2. Coordinates -> weather (Forecast API)
const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
const data = await res.json();                 // { current: {...}, daily: {...} }
```

The JSON gives a numeric **WMO weather code** (`0` = clear sky, `61` = light rain, `95` = thunderstorm…). `script.js` maps each code to a description, a day/night icon and a background theme, then updates the page with `textContent`. API text is never inserted as HTML.

Main functions in `script.js`:

| Function | Role |
|---|---|
| `searchCity(name)` | event handler for the search form: city → coordinates → weather |
| `findCity(name)` | calls the geocoding API and throws a friendly error if the city doesn't exist |
| `getWeather(place, unit)` | calls the forecast API in °C or °F |
| `renderWeather(place, data)` | writes the current weather and 5-day forecast into the page |
| `useMyLocation()` | gets the browser's coordinates (and a place name from BigDataCloud's free reverse geocoding) |
| `getJson(url)` | `fetch()` + HTTP error check + JSON parsing, shared by all API calls |

## Tested

Tested in Chrome with real API calls: several cities on different continents, a city that doesn't exist, the °C/°F switch, recent-search chips, and the mobile layout. There were no errors in the console.
