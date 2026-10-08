import { assertNonNegativeFinite } from './calculation-input.js';

export function personMonthsToHours(
  personMonths: number,
  capacityHours: number,
): number {
  assertNonNegativeFinite(personMonths, 'Person-months');
  assertNonNegativeFinite(capacityHours, 'Monthly capacity');
  return personMonths * capacityHours;
}

export function hoursToPersonMonths(
  hours: number,
  capacityHours: number,
): number {
  assertNonNegativeFinite(hours, 'Allocation hours');
  assertNonNegativeFinite(capacityHours, 'Monthly capacity');
  if (capacityHours === 0) {
    if (hours === 0) return 0;
    throw new RangeError(
      'Positive hours cannot be represented against zero capacity',
    );
  }
  return hours / capacityHours;
}

/** Percent uses the 0-100 scale; values above 100 are allowed. */
export function percentToHours(percent: number, capacityHours: number): number {
  assertNonNegativeFinite(percent, 'Percent');
  assertNonNegativeFinite(capacityHours, 'Monthly capacity');
  return (percent / 100) * capacityHours;
}

export function hoursToPercent(hours: number, capacityHours: number): number {
  return hoursToPersonMonths(hours, capacityHours) * 100;
}
