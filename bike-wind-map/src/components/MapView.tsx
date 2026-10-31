import { useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { RoutePoint } from "../lib/gpx";
import type { WindSample } from "../lib/wind";
import {
  formatSpeed,
  formatDistance,
  formatClockTime,
  degToCompass,
} from "../lib/units";

interface Props {
  routePoints: RoutePoint[];
  windSamples: WindSample[];
}

/** Red (headwind) -> amber (crosswind) -> green (tailwind), based on how much
 * of the wind is working against (-1) or for (+1) the rider. */
function windEffectColor(sample: WindSample): string {
  if (sample.windSpeedMs < 0.1) return "#9ca3af"; // calm, gray
  const t = Math.max(-1, Math.min(1, sample.tailwindMs / sample.windSpeedMs));
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

/**
 * How much detail a marker gets at the current zoom. Markers that would
 * overlap a neighbour are demoted so the map stays readable:
 *   full  - arrow + speed label
 *   arrow - arrow only (tap for details)
 *   dot   - small color-coded dot (tap for details)
 */
type DetailTier = "full" | "arrow" | "dot";

/** Marker footprints in px, relative to the marker's anchor (arrow center). */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const FULL_BOX: Box = { x0: -26, y0: -16, x1: 26, y1: 32 };
const ARROW_BOX: Box = { x0: -16, y0: -16, x1: 16, y1: 16 };

function windArrowIcon(sample: WindSample, tier: DetailTier): L.DivIcon {
  const color = windEffectColor(sample);

  if (tier === "dot") {
    return L.divIcon({
      html: `<div class="wind-dot" style="background:${color}"></div>`,
      className: "wind-marker-wrapper",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  const windBlowingToDeg = (sample.windDirFromDeg + 180) % 360;
  const label =
    tier === "full"
      ? `<div class="wind-marker-label">${formatSpeed(sample.windSpeedMs)}</div>`
      : "";

  const html = `
    <div class="wind-marker">
      <svg width="34" height="34" viewBox="0 0 34 34" style="transform: rotate(${windBlowingToDeg}deg)">
        <path d="M17 3 L24 20 L17 15.5 L10 20 Z" fill="${color}" stroke="#1f2937" stroke-width="1"/>
      </svg>
      ${label}
    </div>
  `;

  return L.divIcon({
    html,
    className: "wind-marker-wrapper",
    iconSize: tier === "full" ? [34, 50] : [34, 34],
    iconAnchor: [17, 17],
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/**
 * Greedily assigns each sample the richest tier that doesn't collide with
 * markers already placed, at the given zoom. Route endpoints and stronger
 * winds get first pick. Depends only on zoom (not pan), so markers don't
 * flicker while dragging the map.
 */
function assignTiers(
  map: L.Map,
  samples: WindSample[],
  zoom: number
): DetailTier[] {
  const px = samples.map((sm) =>
    map.project([sm.point.lat, sm.point.lon], zoom)
  );
  const lastIdx = samples.length - 1;
  const order = samples
    .map((_, i) => i)
    .sort((a, b) => {
      const ea = a === 0 || a === lastIdx ? 1 : 0;
      const eb = b === 0 || b === lastIdx ? 1 : 0;
      if (ea !== eb) return eb - ea;
      return samples[b].windSpeedMs - samples[a].windSpeedMs;
    });

  const tiers: DetailTier[] = samples.map(() => "dot");
  const placed: Box[] = [];

  for (const [tier, box] of [
    ["full", FULL_BOX],
    ["arrow", ARROW_BOX],
  ] as const) {
    for (const i of order) {
      if (tiers[i] !== "dot") continue;
      const b: Box = {
        x0: px[i].x + box.x0,
        y0: px[i].y + box.y0,
        x1: px[i].x + box.x1,
        y1: px[i].y + box.y1,
      };
      if (placed.some((o) => overlaps(b, o))) continue;
      tiers[i] = tier;
      placed.push(b);
    }
  }
  return tiers;
}

const TIER_Z_OFFSET: Record<DetailTier, number> = { full: 1000, arrow: 500, dot: 0 };

function WindMarkers({ samples }: { samples: WindSample[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const tiers = useMemo(() => assignTiers(map, samples, zoom), [map, samples, zoom]);
  const icons = useMemo(
    () => samples.map((sm, i) => windArrowIcon(sm, tiers[i])),
    [samples, tiers]
  );

  return (
    <>
      {samples.map((sample, i) => (
        <Marker
          key={i}
          position={[sample.point.lat, sample.point.lon]}
          icon={icons[i]}
          zIndexOffset={TIER_Z_OFFSET[tiers[i]]}
        >
          <Popup>
            <div className="popup">
              <div>
                <strong>{formatDistance(sample.point.distanceM)}</strong> into
                route
              </div>
              <div>Arrival: {formatClockTime(sample.point.arrivalTime)}</div>
              <div>
                Wind: {formatSpeed(sample.windSpeedMs)} from{" "}
                {degToCompass(sample.windDirFromDeg)}
                {sample.windGustMs
                  ? ` (gusts ${formatSpeed(sample.windGustMs)})`
                  : ""}
              </div>
              <div>
                {sample.tailwindMs >= 0 ? "Tailwind" : "Headwind"}:{" "}
                {formatSpeed(Math.abs(sample.tailwindMs))}
              </div>
              <div>Crosswind: {formatSpeed(Math.abs(sample.crosswindMs))}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function FitBounds({ points }: { points: RoutePoint[] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  return null;
}

export function MapView({ routePoints, windSamples }: Props) {
  const polylinePositions = useMemo<[number, number][]>(
    () => routePoints.map((p) => [p.lat, p.lon]),
    [routePoints]
  );

  const center: [number, number] =
    routePoints.length > 0
      ? [routePoints[0].lat, routePoints[0].lon]
      : [39.8283, -98.5795];

  return (
    <MapContainer center={center} zoom={12} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {routePoints.length > 0 && (
        <>
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }}
          />
          <FitBounds points={routePoints} />
        </>
      )}
      <WindMarkers samples={windSamples} />
    </MapContainer>
  );
}
