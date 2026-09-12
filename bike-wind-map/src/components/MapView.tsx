import { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
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

function windArrowIcon(sample: WindSample): L.DivIcon {
  const color = windEffectColor(sample);
  const windBlowingToDeg = (sample.windDirFromDeg + 180) % 360;
  const speedLabel = formatSpeed(sample.windSpeedMs);

  const html = `
    <div class="wind-marker">
      <svg width="34" height="34" viewBox="0 0 34 34" style="transform: rotate(${windBlowingToDeg}deg)">
        <path d="M17 3 L24 20 L17 15.5 L10 20 Z" fill="${color}" stroke="#1f2937" stroke-width="1"/>
      </svg>
      <div class="wind-marker-label">${speedLabel}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "wind-marker-wrapper",
    iconSize: [34, 50],
    iconAnchor: [17, 17],
  });
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
      {windSamples.map((sample, i) => (
        <Marker
          key={i}
          position={[sample.point.lat, sample.point.lon]}
          icon={windArrowIcon(sample)}
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
    </MapContainer>
  );
}
