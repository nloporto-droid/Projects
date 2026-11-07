/** Red (headwind) -> amber (crosswind) -> green (tailwind), based on how much
 * of the wind is working against (-1) or for (+1) the rider. */
export function windEffectColor(windSpeedMs: number, tailwindMs: number): string {
  if (windSpeedMs < 0.1) return "#9ca3af"; // calm, gray
  const t = Math.max(-1, Math.min(1, tailwindMs / windSpeedMs));
  if (t >= 0) {
    // 0 -> amber (#f59e0b), 1 -> green (#16a34a)
    return lerpColor("#f59e0b", "#16a34a", t);
  }
  // 0 -> amber, -1 -> red (#dc2626)
  return lerpColor("#f59e0b", "#dc2626", -t);
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bch = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r}, ${g}, ${bch})`;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
