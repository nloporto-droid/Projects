export function WindLegend() {
  return (
    <div className="legend">
      <div className="legend-title">Reading the arrows</div>
      <div className="legend-row">
        <span className="legend-swatch" style={{ background: "#dc2626" }} />
        Headwind (working against you)
      </div>
      <div className="legend-row">
        <span className="legend-swatch" style={{ background: "#f59e0b" }} />
        Crosswind
      </div>
      <div className="legend-row">
        <span className="legend-swatch" style={{ background: "#16a34a" }} />
        Tailwind (pushing you along)
      </div>
      <div className="legend-note">
        Arrows point the direction the wind is blowing toward. Color shows
        how much of it is helping or hurting you on that stretch of road;
        the number is total wind speed.
      </div>
    </div>
  );
}
