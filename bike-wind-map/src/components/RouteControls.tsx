import { fromMetersPerSecond, toMetersPerSecond, type PaceUnit } from "../lib/pace";
import { RIDING_POSITIONS, type RidingPosition } from "../lib/power";

export interface ControlsState {
  startTime: string; // datetime-local value
  paceValue: number;
  paceUnit: PaceUnit;
  sampleIntervalMi: number;
  /** Rider + bike + gear, lb. Used for the effort estimate. */
  riderWeightLb: number;
  position: RidingPosition;
}

interface Props {
  value: ControlsState;
  onChange: (next: ControlsState) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const PACE_UNIT_LABELS: Record<PaceUnit, string> = {
  mph: "mph",
  kmh: "km/h",
  minPerMi: "min/mi",
  minPerKm: "min/km",
};

export function RouteControls({ value, onChange, onSubmit, disabled, loading }: Props) {
  function set<K extends keyof ControlsState>(key: K, v: ControlsState[K]) {
    onChange({ ...value, [key]: v });
  }

  /** Switching units converts the number in the box rather than relabeling it. */
  function changeUnit(nextUnit: PaceUnit) {
    const ms = toMetersPerSecond(value.paceValue, value.paceUnit);
    onChange({
      ...value,
      paceUnit: nextUnit,
      paceValue: ms > 0 ? fromMetersPerSecond(ms, nextUnit) : value.paceValue,
    });
  }

  return (
    <form
      className="controls"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Start time</span>
        <input
          type="datetime-local"
          value={value.startTime}
          onChange={(e) => set("startTime", e.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>Avg pace / speed</span>
        <div className="field-row">
          <input
            type="number"
            min={0}
            step="0.1"
            value={value.paceValue}
            onChange={(e) => set("paceValue", parseFloat(e.target.value))}
            required
          />
          <select
            value={value.paceUnit}
            onChange={(e) => changeUnit(e.target.value as PaceUnit)}
          >
            {Object.entries(PACE_UNIT_LABELS).map(([unit, label]) => (
              <option key={unit} value={unit}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className="field">
        <span>Sample every</span>
        <div className="field-row">
          <input
            type="number"
            min={0.25}
            step="0.25"
            value={value.sampleIntervalMi}
            onChange={(e) => set("sampleIntervalMi", parseFloat(e.target.value))}
          />
          <span className="unit-suffix">mi along route</span>
        </div>
      </label>

      <label className="field">
        <span>Rider + bike weight (for effort estimate)</span>
        <div className="field-row">
          <input
            type="number"
            min={50}
            step="1"
            value={value.riderWeightLb}
            onChange={(e) => set("riderWeightLb", parseFloat(e.target.value))}
          />
          <span className="unit-suffix">lb</span>
          <select
            value={value.position}
            onChange={(e) => set("position", e.target.value as RidingPosition)}
          >
            {Object.entries(RIDING_POSITIONS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </label>

      <button type="submit" disabled={disabled || loading}>
        {loading ? "Fetching wind…" : "Get wind forecast"}
      </button>
    </form>
  );
}
