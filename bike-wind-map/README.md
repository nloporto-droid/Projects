# Bike Route Wind Planner

See wind direction and speed along a bike route, timed to when you'll
actually be riding each stretch of road — not just the wind right now.

## How it works

1. Upload a `.gpx` file (or try the built-in sample route).
2. Enter your ride's start time and average pace/speed.
3. The app walks the route, estimating an arrival time at each point based
   on cumulative distance and your pace.
4. It samples the route at a configurable interval (default every 2 miles)
   and fetches an hourly wind forecast for each sample point from
   [Open-Meteo](https://open-meteo.com/) (free, no API key required),
   matching each point to the forecast hour closest to its estimated
   arrival time.
5. Wind is shown on the map as arrows pointing the direction the wind is
   blowing toward, colored by how much it's a headwind (red), crosswind
   (amber), or tailwind (green) *relative to the direction you're
   traveling at that point* — plus the raw wind speed. Tap/click an arrow
   for the full breakdown (arrival time, wind speed, gusts, tailwind and
   crosswind components).

Forecasts are only available for roughly the next 16 days (Open-Meteo's
forecast window); points whose estimated arrival time falls outside that
window, or in the past, are flagged rather than silently dropped.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
```

Everything runs client-side — GPX parsing and the wind forecast fetch both
happen in the browser, no backend required.

## Tech

- React + TypeScript + Vite
- Leaflet / react-leaflet for the map
- Open-Meteo for wind forecasts
