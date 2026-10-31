import { normalizeAngle } from "./geo";
import type { TimedPoint } from "./pace";

export interface WindSample {
  point: TimedPoint;
  forecastTime: Date;
  /** Wind speed at 10m, meters/second. */
  windSpeedMs: number;
  /** Gust speed at 10m, meters/second (if provided by the API). */
  windGustMs?: number;
  /** Meteorological direction the wind is blowing FROM (0=N, 90=E, ...). */
  windDirFromDeg: number;
  /** Component of wind along the rider's travel direction: positive = tailwind (push), negative = headwind (drag). */
  tailwindMs: number;
  /** Component of wind perpendicular to travel: positive = from the right, negative = from the left. */
  crosswindMs: number;
}

export interface OutOfRangeSample {
  point: TimedPoint;
  reason: string;
}

export interface WindResult {
  samples: WindSample[];
  outOfRange: OutOfRangeSample[];
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CHUNK_SIZE = 40;
const MAX_FORECAST_DAYS = 16;

/**
 * Given a wind direction (direction it's blowing FROM) and a rider's travel
 * bearing, decomposes wind speed into a tailwind component (positive = push
 * from behind) and a crosswind component.
 */
export function relativeWind(
  windSpeedMs: number,
  windDirFromDeg: number,
  travelBearingDeg: number
): { tailwindMs: number; crosswindMs: number } {
  const windBlowingToDeg = (windDirFromDeg + 180) % 360;
  const diffDeg = normalizeAngle(windBlowingToDeg - travelBearingDeg);
  const rad = (diffDeg * Math.PI) / 180;
  return {
    tailwindMs: windSpeedMs * Math.cos(rad),
    crosswindMs: windSpeedMs * Math.sin(rad),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface OpenMeteoLocation {
  hourly: {
    time: string[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m?: number[];
  };
}

function closestHourIndex(times: string[], target: Date): number {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    // API times are ISO strings in UTC (no trailing Z since timezone=UTC), e.g. "2026-09-13T14:00"
    const t = new Date(times[i] + "Z").getTime();
    const diff = Math.abs(t - target.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

async function fetchChunk(points: TimedPoint[]): Promise<WindSample[]> {
  if (points.length === 0) return [];

  const now = Date.now();
  const maxArrival = Math.max(...points.map((p) => p.arrivalTime.getTime()));
  const hoursAhead = Math.max(1, (maxArrival - now) / (1000 * 60 * 60));
  const forecastDays = Math.min(
    MAX_FORECAST_DAYS,
    Math.max(1, Math.ceil(hoursAhead / 24) + 1)
  );

  const lat = points.map((p) => p.lat.toFixed(5)).join(",");
  const lon = points.map((p) => p.lon.toFixed(5)).join(",");

  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set(
    "hourly",
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m"
  );
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", String(forecastDays));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Wind forecast request failed (${res.status}): ${body || res.statusText}`
    );
  }
  const data = await res.json();

  // Open-Meteo returns a single object for one location, or an array for multiple.
  const locations: OpenMeteoLocation[] = Array.isArray(data) ? data : [data];

  return points.map((point, i) => {
    const loc = locations[i];
    const idx = closestHourIndex(loc.hourly.time, point.arrivalTime);
    const windSpeedMs = loc.hourly.wind_speed_10m[idx];
    const windDirFromDeg = loc.hourly.wind_direction_10m[idx];
    const windGustMs = loc.hourly.wind_gusts_10m?.[idx];
    const { tailwindMs, crosswindMs } = relativeWind(
      windSpeedMs,
      windDirFromDeg,
      point.bearingDeg
    );
    return {
      point,
      forecastTime: new Date(loc.hourly.time[idx] + "Z"),
      windSpeedMs,
      windGustMs,
      windDirFromDeg,
      tailwindMs,
      crosswindMs,
    };
  });
}

/**
 * Fetches wind forecasts for a set of route points at their estimated
 * arrival times, using Open-Meteo (free, no API key). Points whose arrival
 * time falls outside the ~16-day forecast window (or in the past) are
 * reported separately rather than causing the whole request to fail.
 */
export async function fetchWindForRoute(
  points: TimedPoint[]
): Promise<WindResult> {
  const now = Date.now();
  const maxForecastMs = MAX_FORECAST_DAYS * 24 * 60 * 60 * 1000;

  const inRange: TimedPoint[] = [];
  const outOfRange: OutOfRangeSample[] = [];

  for (const p of points) {
    const t = p.arrivalTime.getTime();
    if (t < now - 60 * 60 * 1000) {
      outOfRange.push({ point: p, reason: "Arrival time is in the past" });
    } else if (t > now + maxForecastMs) {
      outOfRange.push({
        point: p,
        reason: `Arrival time is beyond the ${MAX_FORECAST_DAYS}-day forecast window`,
      });
    } else {
      inRange.push(p);
    }
  }

  const chunks = chunk(inRange, CHUNK_SIZE);
  const results = await Promise.all(chunks.map(fetchChunk));

  return { samples: results.flat(), outOfRange };
}
