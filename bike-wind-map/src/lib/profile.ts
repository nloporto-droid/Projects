import { bearing } from "./geo";
import type { ParsedRoute, RoutePoint } from "./gpx";
import { powerWatts, type RiderParams } from "./power";
import { relativeWind, type WindSample } from "./wind";

export interface ProfilePoint {
  distanceM: number;
  lat: number;
  lon: number;
  /** Smoothed elevation, meters. */
  eleM: number;
  /** Smoothed grade as rise/run (0.05 = 5%). */
  grade: number;
  /** Interpolated 10m wind speed, m/s. */
  windSpeedMs: number;
  windDirFromDeg: number;
  /** Positive = tailwind, relative to the route's direction at this point. */
  tailwindMs: number;
  /** Power needed to hold the planned speed here. */
  watts: number;
}

export interface EffortProfile {
  points: ProfilePoint[];
  totalDistanceM: number;
  /** Mean power over the whole ride, coasting stretches included. */
  avgWatts: number;
  elevationGainM: number;
  minEleM: number;
  maxEleM: number;
  maxWindMs: number;
  /** False when no forecast has been fetched, so watts assume still air. */
  hasWind: boolean;
}

/**
 * Wind forecasts are for 10m above ground; a rider's body and bike sit near
 * 1m, where wind is noticeably lighter. Scale the forecast wind down before
 * feeding it to the power model.
 */
const WIND_AT_RIDER_FACTOR = 0.7;

const MAX_BINS = 300;
const MAX_GRADE = 0.2;

export function routeHasElevation(route: ParsedRoute): boolean {
  return route.points.filter((p) => p.ele !== undefined).length >= 2;
}

/** Linear interpolation of `value` along a distance-sorted point list. */
function sampler(points: RoutePoint[], value: (p: RoutePoint) => number) {
  return (d: number): number => {
    let lo = 0;
    let hi = points.length - 1;
    if (d <= points[0].distanceM) return value(points[0]);
    if (d >= points[hi].distanceM) return value(points[hi]);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].distanceM <= d) lo = mid;
      else hi = mid;
    }
    const span = points[hi].distanceM - points[lo].distanceM;
    const t = span > 0 ? (d - points[lo].distanceM) / span : 0;
    return value(points[lo]) + (value(points[hi]) - value(points[lo])) * t;
  };
}

/** Wind (speed + from-direction) at a distance, interpolated between forecast samples. */
function windSampler(samples: WindSample[]) {
  const toXY = (s: WindSample) => {
    const rad = (s.windDirFromDeg * Math.PI) / 180;
    return { x: s.windSpeedMs * Math.sin(rad), y: s.windSpeedMs * Math.cos(rad) };
  };
  return (d: number): { speedMs: number; dirFromDeg: number } => {
    if (samples.length === 0) return { speedMs: 0, dirFromDeg: 0 };
    const i = samples.findIndex((s) => s.point.distanceM >= d);
    let x: number;
    let y: number;
    if (i === -1) {
      ({ x, y } = toXY(samples[samples.length - 1]));
    } else if (i === 0) {
      ({ x, y } = toXY(samples[0]));
    } else {
      const a = samples[i - 1];
      const b = samples[i];
      const span = b.point.distanceM - a.point.distanceM;
      const t = span > 0 ? (d - a.point.distanceM) / span : 0;
      const pa = toXY(a);
      const pb = toXY(b);
      x = pa.x + (pb.x - pa.x) * t;
      y = pa.y + (pb.y - pa.y) * t;
    }
    return {
      speedMs: Math.hypot(x, y),
      dirFromDeg: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
    };
  };
}

/**
 * Walks the route in even distance bins and works out elevation, grade,
 * wind along the direction of travel, and the power needed to hold
 * `speedMps` at each bin. Returns null if the route has no elevation data.
 */
export function buildEffortProfile(
  route: ParsedRoute,
  windSamples: WindSample[],
  speedMps: number,
  rider: RiderParams
): EffortProfile | null {
  const withEle = route.points.filter((p) => p.ele !== undefined);
  const total = route.totalDistanceM;
  if (withEle.length < 2 || total <= 0 || speedMps <= 0) return null;

  const binCount = Math.min(MAX_BINS, Math.max(20, Math.floor(total / 25)));
  const step = total / binCount;
  const dist = Array.from({ length: binCount + 1 }, (_, i) => i * step);

  const eleAt = sampler(withEle, (p) => p.ele as number);
  const latAt = sampler(route.points, (p) => p.lat);
  const lonAt = sampler(route.points, (p) => p.lon);
  const windAt = windSampler(windSamples);

  // GPS elevation is jittery; a moving average keeps grade from spiking.
  const eleRaw = dist.map(eleAt);
  const half = Math.max(1, Math.min(8, Math.round(100 / step)));
  const ele = eleRaw.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(eleRaw.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += eleRaw[j];
    return sum / (to - from + 1);
  });

  let gain = 0;
  for (let i = 1; i < ele.length; i++) gain += Math.max(0, ele[i] - ele[i - 1]);

  const hasWind = windSamples.length > 0;
  let maxWindMs = 0;
  let wattsSum = 0;

  const points: ProfilePoint[] = dist.map((d, i) => {
    const prev = Math.max(0, i - 1);
    const next = Math.min(dist.length - 1, i + 1);
    const grade = Math.max(
      -MAX_GRADE,
      Math.min(MAX_GRADE, (ele[next] - ele[prev]) / (dist[next] - dist[prev]))
    );

    const lat = latAt(d);
    const lon = lonAt(d);
    const ahead = i < dist.length - 1 ? i + 1 : i;
    const behind = i < dist.length - 1 ? i : i - 1;
    const travelBearing = bearing(
      { lat: latAt(dist[behind]), lon: lonAt(dist[behind]) },
      { lat: latAt(dist[ahead]), lon: lonAt(dist[ahead]) }
    );

    const wind = windAt(d);
    const { tailwindMs } = relativeWind(wind.speedMs, wind.dirFromDeg, travelBearing);
    maxWindMs = Math.max(maxWindMs, wind.speedMs);

    const watts = powerWatts(speedMps, grade, tailwindMs * WIND_AT_RIDER_FACTOR, rider);
    wattsSum += watts;

    return {
      distanceM: d,
      lat,
      lon,
      eleM: ele[i],
      grade,
      windSpeedMs: wind.speedMs,
      windDirFromDeg: wind.dirFromDeg,
      tailwindMs,
      watts,
    };
  });

  return {
    points,
    totalDistanceM: total,
    avgWatts: wattsSum / points.length,
    elevationGainM: gain,
    minEleM: Math.min(...ele),
    maxEleM: Math.max(...ele),
    maxWindMs,
    hasWind,
  };
}
