const G = 9.80665;
const LB_IN_KG = 0.45359237;

export type RidingPosition = "drops" | "hoods" | "upright";

export const RIDING_POSITIONS: Record<RidingPosition, { label: string; cdA: number }> = {
  drops: { label: "Drops (aero)", cdA: 0.3 },
  hoods: { label: "Hoods", cdA: 0.36 },
  upright: { label: "Upright", cdA: 0.45 },
};

export interface RiderParams {
  /** Rider + bike + gear, kg. */
  massKg: number;
  /** Drag area, m^2. */
  cdA: number;
  /** Rolling resistance coefficient (decent road tires on pavement). */
  crr: number;
  /** Fraction of pedaling power that reaches the wheel. */
  drivetrainEff: number;
  /** Air density, kg/m^3 (sea level, ~15 C). */
  airDensity: number;
}

export function riderParams(weightLb: number, position: RidingPosition): RiderParams {
  return {
    massKg: weightLb * LB_IN_KG,
    cdA: RIDING_POSITIONS[position].cdA,
    crr: 0.005,
    drivetrainEff: 0.975,
    airDensity: 1.2,
  };
}

/**
 * Steady-state power needed to hold `speedMps` over the ground on a given
 * grade (rise/run) with a given tailwind (positive = pushing the rider).
 * Gravity + rolling + aero, divided by drivetrain efficiency. Descents that
 * would need negative power are clamped to 0 (coasting).
 */
export function powerWatts(
  speedMps: number,
  grade: number,
  tailwindMs: number,
  rider: RiderParams
): number {
  if (speedMps <= 0) return 0;
  const theta = Math.atan(grade);
  const airSpeed = speedMps - tailwindMs;
  const aero = 0.5 * rider.airDensity * rider.cdA * airSpeed * Math.abs(airSpeed);
  const gravity = rider.massKg * G * Math.sin(theta);
  const rolling = rider.massKg * G * rider.crr * Math.cos(theta);
  return Math.max(0, ((aero + gravity + rolling) * speedMps) / rider.drivetrainEff);
}
