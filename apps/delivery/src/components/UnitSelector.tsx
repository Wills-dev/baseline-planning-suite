import type { EditableUnit } from '../application/allocation-values';

export function UnitSelector({
  unit,
  disabled,
  onChange,
}: {
  unit: EditableUnit;
  disabled: boolean;
  onChange: (unit: EditableUnit) => void;
}) {
  return (
    <div>
      <label htmlFor="allocation-unit">Allocation unit</label>
      <select
        id="allocation-unit"
        value={unit}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as EditableUnit)}
      >
        <option value="PM">PM</option>
        <option value="Hours">Hours</option>
        <option value="Percent">% capacity</option>
        <option value="Cost">Cost (EUR)</option>
      </select>
      <p id="delivery-cost-help">
        Cost is derived in EUR from effective-dated monthly rates. Only hours
        are persisted.
      </p>
    </div>
  );
}
