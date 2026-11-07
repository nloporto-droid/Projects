import { useEffect, useMemo, useRef, useState } from "react";
import type { EffortProfile } from "../lib/profile";
import { windEffectColor } from "../lib/windColor";
import { degToCompass, formatDistance, msToMph } from "../lib/units";

interface Props {
  profile: EffortProfile;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}

const M_TO_FT = 3.28084;
const MI_IN_M = 1609.344;

const MARGIN = { left: 46, right: 40, top: 16 };
const ELE_H = 104;
const GAP = 16;
const WATTS_H = 44;
const AXIS_H = 22;
const HEIGHT = MARGIN.top + ELE_H + GAP + WATTS_H + AXIS_H;

const WATTS_COLOR = "#7c3aed";

function niceCeil(value: number, step: number, min: number): number {
  return Math.max(min, Math.ceil(value / step) * step);
}

function distanceTicks(totalMi: number): number[] {
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => totalMi / s <= 8) ?? 100;
  const ticks: number[] = [];
  for (let mi = 0; mi <= totalMi + 1e-6; mi += step) ticks.push(mi);
  return ticks;
}

export function ElevationProfile({ profile, hoverIdx, onHover }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { points, totalDistanceM } = profile;
  const plotW = Math.max(50, width - MARGIN.left - MARGIN.right);
  const eleTop = MARGIN.top;
  const wattsTop = MARGIN.top + ELE_H + GAP;

  const chart = useMemo(() => {
    const x = (d: number) => MARGIN.left + (d / totalDistanceM) * plotW;

    const eleLo = profile.minEleM;
    const eleHi = profile.maxEleM;
    const pad = Math.max((eleHi - eleLo) * 0.1, 3);
    const eleMin = eleLo - pad;
    const eleMax = eleHi + pad;
    const yEle = (e: number) => eleTop + ELE_H * (1 - (e - eleMin) / (eleMax - eleMin));

    const windMaxMph = niceCeil(msToMph(profile.maxWindMs), 5, 10);
    const yWind = (ms: number) => eleTop + ELE_H * (1 - msToMph(ms) / windMaxMph);

    const wattsMax = niceCeil(Math.max(...points.map((p) => p.watts)), 50, 100);
    const yWatts = (w: number) => wattsTop + WATTS_H * (1 - w / wattsMax);

    const eleLine = points.map((p) => `${x(p.distanceM)},${yEle(p.eleM)}`).join(" ");
    const areaPath =
      `M${x(0)},${eleTop + ELE_H} L` +
      points.map((p) => `${x(p.distanceM)},${yEle(p.eleM)}`).join(" L") +
      ` L${x(totalDistanceM)},${eleTop + ELE_H} Z`;
    const wattsLine = points.map((p) => `${x(p.distanceM)},${yWatts(p.watts)}`).join(" ");

    const windSegments = profile.hasWind
      ? points.slice(1).map((p, i) => {
          const a = points[i];
          return {
            x1: x(a.distanceM),
            y1: yWind(a.windSpeedMs),
            x2: x(p.distanceM),
            y2: yWind(p.windSpeedMs),
            color: windEffectColor(
              (a.windSpeedMs + p.windSpeedMs) / 2,
              (a.tailwindMs + p.tailwindMs) / 2
            ),
          };
        })
      : [];

    const eleTicks = [eleLo, (eleLo + eleHi) / 2, eleHi];
    const windTicks = [0, windMaxMph / 2, windMaxMph];

    return {
      x,
      yEle,
      yWatts,
      yAvg: yWatts(profile.avgWatts),
      eleLine,
      areaPath,
      wattsLine,
      windSegments,
      eleTicks,
      windTicks,
      windMaxMph,
      wattsMax,
    };
  }, [profile, points, totalDistanceM, plotW, eleTop, wattsTop]);

  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onHover(Math.round(frac * (points.length - 1)));
  }

  const hover = hoverIdx !== null ? points[hoverIdx] : undefined;
  const totalMi = totalDistanceM / MI_IN_M;

  return (
    <section className="profile-panel">
      <div className="profile-header">
        <div className="profile-title">
          Elevation, wind &amp; effort
          <span className="profile-sub">
            {" "}
            · +{Math.round(profile.elevationGainM * M_TO_FT).toLocaleString()} ft climbing
          </span>
        </div>
        <div className="profile-readout">
          {hover ? (
            <>
              {formatDistance(hover.distanceM)} ·{" "}
              {Math.round(hover.eleM * M_TO_FT).toLocaleString()} ft ·{" "}
              {(hover.grade * 100).toFixed(1)}%
              {profile.hasWind && (
                <>
                  {" "}
                  · {msToMph(hover.windSpeedMs).toFixed(1)} mph from{" "}
                  {degToCompass(hover.windDirFromDeg)} (
                  {hover.tailwindMs >= 0 ? "tail" : "head"}{" "}
                  {msToMph(Math.abs(hover.tailwindMs)).toFixed(1)})
                </>
              )}{" "}
              · <strong style={{ color: WATTS_COLOR }}>{Math.round(hover.watts)} W</strong>
            </>
          ) : (
            <>
              Predicted avg effort{" "}
              <strong style={{ color: WATTS_COLOR }}>
                {Math.round(profile.avgWatts)} W
              </strong>
              {!profile.hasWind && " (still air — get the forecast to add wind)"}
            </>
          )}
        </div>
      </div>

      <div ref={wrapRef} className="profile-chart">
        <svg width={width} height={HEIGHT} role="img" aria-label="Elevation, wind and power profile">
          {/* Elevation panel */}
          {chart.eleTicks.map((e, i) => (
            <g key={`e${i}`}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={chart.yEle(e)}
                y2={chart.yEle(e)}
                className="grid-line"
              />
              <text x={MARGIN.left - 6} y={chart.yEle(e) + 3} textAnchor="end" className="axis-text">
                {Math.round(e * M_TO_FT).toLocaleString()}
              </text>
            </g>
          ))}
          <text x={MARGIN.left - 6} y={eleTop - 6} textAnchor="end" className="axis-unit">
            ft
          </text>
          <path d={chart.areaPath} className="ele-area" />
          <polyline points={chart.eleLine} className="ele-line" />

          {/* Wind overlay (right axis) */}
          {profile.hasWind && (
            <>
              {chart.windTicks.map((w, i) => (
                <text
                  key={`w${i}`}
                  x={MARGIN.left + plotW + 6}
                  y={eleTop + ELE_H * (1 - w / chart.windMaxMph) + 3}
                  className="axis-text"
                >
                  {w}
                </text>
              ))}
              <text x={MARGIN.left + plotW + 6} y={eleTop - 6} className="axis-unit">
                mph
              </text>
              {chart.windSegments.map((s, i) => (
                <line
                  key={i}
                  x1={s.x1}
                  y1={s.y1}
                  x2={s.x2}
                  y2={s.y2}
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              ))}
            </>
          )}

          {/* Watts panel */}
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotW}
            y1={wattsTop + WATTS_H}
            y2={wattsTop + WATTS_H}
            className="grid-line"
          />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotW}
            y1={wattsTop}
            y2={wattsTop}
            className="grid-line"
          />
          <text x={MARGIN.left - 6} y={wattsTop + 3} textAnchor="end" className="axis-text">
            {chart.wattsMax}
          </text>
          <text x={MARGIN.left - 6} y={wattsTop + WATTS_H + 3} textAnchor="end" className="axis-text">
            0
          </text>
          <text x={MARGIN.left - 6} y={wattsTop + WATTS_H / 2 + 3} textAnchor="end" className="axis-unit">
            W
          </text>
          <polyline points={chart.wattsLine} fill="none" stroke={WATTS_COLOR} strokeWidth={1.5} />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotW}
            y1={chart.yAvg}
            y2={chart.yAvg}
            stroke={WATTS_COLOR}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          <text
            x={MARGIN.left + plotW - 4}
            y={chart.yAvg - 3}
            textAnchor="end"
            className="avg-label"
            fill={WATTS_COLOR}
          >
            avg {Math.round(profile.avgWatts)} W
          </text>

          {/* Distance axis */}
          {distanceTicks(totalMi).map((mi) => (
            <text
              key={mi}
              x={chart.x(mi * MI_IN_M)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="axis-text"
            >
              {mi === 0 ? "0 mi" : mi}
            </text>
          ))}

          {/* Hover cursor + hit area */}
          {hover && (
            <>
              <line
                x1={chart.x(hover.distanceM)}
                x2={chart.x(hover.distanceM)}
                y1={eleTop}
                y2={wattsTop + WATTS_H}
                className="cursor-line"
              />
              <circle cx={chart.x(hover.distanceM)} cy={chart.yEle(hover.eleM)} r={3.5} className="cursor-dot" />
              <circle
                cx={chart.x(hover.distanceM)}
                cy={chart.yWatts(hover.watts)}
                r={3.5}
                fill={WATTS_COLOR}
                className="cursor-dot"
              />
            </>
          )}
          <rect
            x={MARGIN.left}
            y={eleTop}
            width={plotW}
            height={ELE_H + GAP + WATTS_H}
            fill="transparent"
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => onHover(null)}
            style={{ touchAction: "pan-y" }}
          />
        </svg>
      </div>

      <div className="profile-note">
        Effort assumes you hold your pace as a steady ground speed. Wind line is
        colored like the map arrows (red head, green tail); forecast wind is
        scaled to ~70% for rider height. Descents that need no pedaling count as 0 W.
      </div>
    </section>
  );
}
