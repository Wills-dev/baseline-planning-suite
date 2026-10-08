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
        <option value="Cost" disabled>
          Cost (unavailable)
        </option>
      </select>
      <p id="delivery-cost-help">
        Cost is unavailable until authoritative People rates are connected. No
        rate data is copied into Delivery.
      </p>
    </div>
  );
}
