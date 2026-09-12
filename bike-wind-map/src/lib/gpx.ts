import { haversineDistance, bearing, type LatLon } from "./geo";

export interface RoutePoint extends LatLon {
  ele?: number;
  /** Cumulative distance from the start of the route, in meters. */
  distanceM: number;
  /** Direction of travel at this point (degrees, 0=N), toward the next point. */
  bearingDeg: number;
}

export interface ParsedRoute {
  name?: string;
  points: RoutePoint[];
  totalDistanceM: number;
}

/** Parses a GPX file's text into a route, using track points (or route points as fallback). */
export function parseGpx(gpxText: string): ParsedRoute {
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("That file doesn't look like valid GPX/XML.");
  }

  let ptEls = Array.from(doc.querySelectorAll("trkpt"));
  if (ptEls.length === 0) {
    ptEls = Array.from(doc.querySelectorAll("rtept"));
  }
  if (ptEls.length === 0) {
    throw new Error(
      "No track or route points found in this GPX file (looked for <trkpt> and <rtept>)."
    );
  }

  const raw: LatLon[] = [];
  const elevations: (number | undefined)[] = [];

  for (const el of ptEls) {
    const lat = parseFloat(el.getAttribute("lat") ?? "");
    const lon = parseFloat(el.getAttribute("lon") ?? "");
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    raw.push({ lat, lon });
    const eleText = el.querySelector("ele")?.textContent;
    elevations.push(eleText ? parseFloat(eleText) : undefined);
  }

  if (raw.length < 2) {
    throw new Error("This GPX file needs at least two valid points to make a route.");
  }

  const points: RoutePoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    const segBearing = next ? bearing(raw[i], next) : points[i - 1]?.bearingDeg ?? 0;
    if (i > 0) {
      cumulative += haversineDistance(raw[i - 1], raw[i]);
    }
    points.push({
      lat: raw[i].lat,
      lon: raw[i].lon,
      ele: elevations[i],
      distanceM: cumulative,
      bearingDeg: segBearing,
    });
  }

  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    undefined;

  return {
    name,
    points,
    totalDistanceM: cumulative,
  };
}

/**
 * Reduces a dense route to evenly-spaced sample points (by distance), always
 * including the first and last point. Used to limit how many wind lookups
 * we need along a route.
 */
export function sampleRouteByDistance(
  route: ParsedRoute,
  intervalM: number
): RoutePoint[] {
  if (route.points.length === 0) return [];
  const samples: RoutePoint[] = [route.points[0]];
  let nextTarget = intervalM;

  for (const pt of route.points) {
    if (pt.distanceM >= nextTarget) {
      samples.push(pt);
      nextTarget += intervalM;
    }
  }

  const last = route.points[route.points.length - 1];
  if (samples[samples.length - 1] !== last) {
    samples.push(last);
  }
  return samples;
}
