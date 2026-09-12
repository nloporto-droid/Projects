import type { PaceUnit } from "../lib/pace";

export interface ControlsState {
  startTime: string; // datetime-local value
  paceValue: number;
  paceUnit: PaceUnit;
  sampleIntervalMi: number;
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
            onChange={(e) => set("paceUnit", e.target.value as PaceUnit)}
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

      <button type="submit" disabled={disabled || loading}>
        {loading ? "Fetching wind…" : "Get wind forecast"}
      </button>
    </form>
  );
}
