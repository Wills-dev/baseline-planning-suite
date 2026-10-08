import { assertNonNegativeFinite } from './calculation-input.js';
import type { WeeklyHours } from './employee.js';

export function monthlyCapacityHours(
  weeklyHours: WeeklyHours,
  workingDays: number,
): number {
  assertNonNegativeFinite(weeklyHours, 'Weekly hours');
  assertNonNegativeFinite(workingDays, 'Working days');
  if (!Number.isInteger(workingDays)) {
    throw new RangeError('Working days must be an integer');
  }
  return (weeklyHours * workingDays) / 5;
}
