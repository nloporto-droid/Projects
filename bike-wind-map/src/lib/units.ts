export function msToMph(ms: number): number {
  return ms * 2.2369362921;
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

export function formatSpeed(ms: number): string {
  return `${msToMph(ms).toFixed(1)} mph`;
}

export function formatDistance(m: number): string {
  return `${metersToMiles(m).toFixed(1)} mi`;
}

export function formatClockTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/** Converts a meteorological "from" direction in degrees to a compass label. */
export function degToCompass(deg: number): string {
  const idx = Math.round(normalizeToPositive(deg) / 22.5) % 16;
  return COMPASS_POINTS[idx];
}

function normalizeToPositive(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
