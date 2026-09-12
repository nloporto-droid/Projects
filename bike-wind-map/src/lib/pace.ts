import type { RoutePoint } from "./gpx";

export type PaceUnit = "mph" | "kmh" | "minPerMi" | "minPerKm";

const MI_IN_M = 1609.344;
const KM_IN_M = 1000;

/** Converts a pace/speed value + unit into meters per second. */
export function toMetersPerSecond(value: number, unit: PaceUnit): number {
  if (value <= 0 || !Number.isFinite(value)) return 0;
  switch (unit) {
    case "mph":
      return (value * MI_IN_M) / 3600;
    case "kmh":
      return (value * KM_IN_M) / 3600;
    case "minPerMi":
      return MI_IN_M / (value * 60);
    case "minPerKm":
      return KM_IN_M / (value * 60);
  }
}

export interface TimedPoint extends RoutePoint {
  /** Seconds elapsed since ride start when the rider reaches this point. */
  elapsedS: number;
  /** Estimated wall-clock arrival time. */
  arrivalTime: Date;
}

/** Attaches an estimated arrival time to every route point given a start time and steady speed. */
export function estimateArrivalTimes(
  points: RoutePoint[],
  startTime: Date,
  speedMps: number
): TimedPoint[] {
  const safeSpeed = speedMps > 0 ? speedMps : 1e-6;
  return points.map((pt) => {
    const elapsedS = pt.distanceM / safeSpeed;
    return {
      ...pt,
      elapsedS,
      arrivalTime: new Date(startTime.getTime() + elapsedS * 1000),
    };
  });
}
