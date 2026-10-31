import { useMemo, useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { RouteControls, type ControlsState } from "./components/RouteControls";
import { MapView } from "./components/MapView";
import { WindLegend } from "./components/WindLegend";
import { parseGpx, sampleRouteByDistance, type ParsedRoute } from "./lib/gpx";
import {
  estimateArrivalTimes,
  fromMetersPerSecond,
  toMetersPerSecond,
  type TimedPoint,
} from "./lib/pace";
import { fetchWindForRoute, type WindResult } from "./lib/wind";
import { formatDistance, formatClockTime, formatSpeed } from "./lib/units";

const MI_IN_M = 1609.344;

function defaultStartTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function App() {
  const [fileName, setFileName] = useState<string>();
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);

  const [controls, setControls] = useState<ControlsState>({
    startTime: defaultStartTimeLocal(),
    paceValue: 15,
    paceUnit: "mph",
    sampleIntervalMi: 2,
  });

  const [windResult, setWindResult] = useState<WindResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [windError, setWindError] = useState<string | null>(null);

  const timedSamplePoints = useMemo<TimedPoint[] | null>(() => {
    if (!route) return null;
    const speedMps = toMetersPerSecond(controls.paceValue, controls.paceUnit);
    const samples = sampleRouteByDistance(route, controls.sampleIntervalMi * MI_IN_M);
    const startTime = new Date(controls.startTime);
    if (Number.isNaN(startTime.getTime()) || speedMps <= 0) return null;
    return estimateArrivalTimes(samples, startTime, speedMps);
  }, [route, controls]);

  const rideDurationS = timedSamplePoints
    ? timedSamplePoints[timedSamplePoints.length - 1]?.elapsedS ?? 0
    : 0;

  function handleGpxLoad(text: string, name: string) {
    setFileName(name);
    setWindResult(null);
    setWindError(null);
    try {
      const parsed = parseGpx(text);
      setRoute(parsed);
      setGpxError(null);
      // A recorded ride carries its own timestamps; use the rider's actual
      // moving speed instead of a guess. Planned routes keep the current pace.
      if (parsed.movingSpeedMps) {
        const speed = parsed.movingSpeedMps;
        setControls((c) => ({
          ...c,
          paceValue: fromMetersPerSecond(speed, c.paceUnit),
        }));
      }
    } catch (err) {
      setRoute(null);
      setGpxError(err instanceof Error ? err.message : "Couldn't parse that GPX file.");
    }
  }

  async function handleLoadSample() {
    const res = await fetch(`${import.meta.env.BASE_URL}sample-route.gpx`);
    const text = await res.text();
    handleGpxLoad(text, "sample-route.gpx");
  }

  async function handleGetForecast() {
    if (!timedSamplePoints) return;
    setLoading(true);
    setWindError(null);
    try {
      const result = await fetchWindForRoute(timedSamplePoints);
      setWindResult(result);
    } catch (err) {
      setWindError(err instanceof Error ? err.message : "Failed to fetch wind forecast.");
      setWindResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Bike Route Wind Planner</h1>
        <p className="subtitle">
          Upload a GPX route, set your start time and pace, and see wind
          direction &amp; speed mapped to when you'll actually be riding
          each section.
        </p>

        <FileUpload onLoad={handleGpxLoad} fileName={fileName} />
        <button type="button" className="link-button" onClick={handleLoadSample}>
          Try a sample route instead
        </button>
        {gpxError && <div className="error">{gpxError}</div>}

        {route && (
          <div className="route-summary">
            <div>{route.name ?? "Route"}</div>
            <div>{formatDistance(route.totalDistanceM)} total</div>
            {route.movingSpeedMps && (
              <div>
                Your moving avg: {formatSpeed(route.movingSpeedMps)} (stops
                excluded)
              </div>
            )}
            {timedSamplePoints && (
              <div>Est. ride time: {formatDuration(rideDurationS)}</div>
            )}
          </div>
        )}

        <RouteControls
          value={controls}
          onChange={setControls}
          onSubmit={handleGetForecast}
          disabled={!route}
          loading={loading}
        />

        {windError && <div className="error">{windError}</div>}

        {windResult && windResult.outOfRange.length > 0 && (
          <div className="warning">
            {windResult.outOfRange.length} of{" "}
            {windResult.outOfRange.length + windResult.samples.length} sample
            point(s) are outside the 16-day forecast window (or in the past)
            and aren't shown, including the one arriving around{" "}
            {formatClockTime(windResult.outOfRange[0].point.arrivalTime)}.
          </div>
        )}

        {windResult && windResult.samples.length > 0 && <WindLegend />}
      </aside>

      <main className="map-wrap">
        <MapView
          routePoints={route?.points ?? []}
          windSamples={windResult?.samples ?? []}
        />
      </main>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
