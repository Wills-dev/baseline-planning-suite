/** Display units are integers so reconciliation does not depend on decimal summation. */
export function displayScale(decimalPlaces: number): number {
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 6
  )
    throw new RangeError('Display precision must be an integer from 0 to 6.');
  return 10 ** decimalPlaces;
}

function tolerance(value: number): number {
  return Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
}

function scaledValue(value: number, scale: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('Display values must be finite and non-negative.');
  const scaled = value * scale;
  if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER - 1)
    throw new RangeError('Display value exceeds safe integer precision.');
  const nearest = Math.round(scaled);
  return Math.abs(scaled - nearest) <= tolerance(scaled) ? nearest : scaled;
}

/** Stable largest remainder, optionally constrained to a parent's assigned integer total.
 * The optional target supports recursive reconciliation of intermediate WBS parents.
 * Never use these display units in business calculations or persistence.
 */
export function reconcileRoundedUnits(
  values: readonly number[],
  decimalPlaces: number,
  targetUnits?: number,
): number[] {
  const scale = displayScale(decimalPlaces);
  const scaled = values.map((value) => scaledValue(value, scale));
  // Compensated summation reduces accumulated error across many children.
  let total = 0;
  let correction = 0;
  for (const value of scaled) {
    const adjusted = value - correction;
    const next = total + adjusted;
    correction = next - total - adjusted;
    total = next;
  }
  if (total > Number.MAX_SAFE_INTEGER - 1)
    throw new RangeError('Display total exceeds safe integer precision.');
  const lowerTotal = Math.floor(total);
  const target =
    targetUnits ??
    lowerTotal + (total - lowerTotal >= 0.5 - tolerance(total) ? 1 : 0);
  const units = scaled.map(Math.floor);
  const base = units.reduce((sum, value) => sum + value, 0);
  const remaining = target - base;
  if (
    !Number.isSafeInteger(target) ||
    remaining < 0 ||
    remaining > scaled.filter((value) => value > Math.floor(value)).length
  )
    throw new RangeError(
      'Display target cannot be reconciled to these children.',
    );
  const order = scaled.map((value, index) => ({
    index,
    remainder: value - (units[index] ?? 0),
  }));
  const remainderTolerance = scaled.reduce(
    (largest, value) => Math.max(largest, tolerance(value)),
    tolerance(1),
  );
  order.sort((a, b) => {
    const difference = b.remainder - a.remainder;
    return Math.abs(difference) <= remainderTolerance
      ? a.index - b.index
      : difference;
  });
  for (const child of order.slice(0, remaining)) {
    units[child.index] = (units[child.index] ?? 0) + 1;
  }
  return units;
}

export function reconcileRoundedValues(
  values: readonly number[],
  decimalPlaces: number,
): number[] {
  const scale = displayScale(decimalPlaces);
  return reconcileRoundedUnits(values, decimalPlaces).map(
    (value) => value / scale,
  );
}
