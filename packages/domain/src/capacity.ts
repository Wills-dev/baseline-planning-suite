import type { Allocation } from './allocation.js';
import type { YearMonth } from './date-only.js';
import { getWorkingDays } from './working-days.js';
import { hoursToPercent } from './allocation-conversions.js';
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

export interface CapacityStatus {
  employeeId: string;
  month: YearMonth;
  allocatedHours: number;
  capacityHours: number;
  utilizationPercent: number;
  overAllocated: boolean;
}

export function capacityKey(employeeId: string, month: YearMonth): string {
  return JSON.stringify([employeeId, month]);
}

/** Group canonical hours once, independent of project or selected work item. */
export function calculateCapacityStatuses(
  people: readonly { employeeId: string; weeklyHours: WeeklyHours }[],
  months: readonly YearMonth[],
  allocations: readonly Pick<Allocation, 'employeeId' | 'month' | 'hours'>[],
): ReadonlyMap<string, CapacityStatus> {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    assertNonNegativeFinite(allocation.hours, 'Allocation hours');
    const key = capacityKey(allocation.employeeId, allocation.month);
    const total = (totals.get(key) ?? 0) + allocation.hours;
    assertNonNegativeFinite(total, 'Total allocation hours');
    totals.set(key, total);
  }
  const days = new Map(
    months.map((month) => [month, getWorkingDays(month).length]),
  );
  const statuses = new Map<string, CapacityStatus>();
  for (const person of people) {
    for (const month of months) {
      const key = capacityKey(person.employeeId, month);
      const allocatedHours = totals.get(key) ?? 0;
      const capacityHours = monthlyCapacityHours(
        person.weeklyHours,
        days.get(month)!,
      );
      const utilizationPercent = hoursToPercent(allocatedHours, capacityHours);
      statuses.set(key, {
        employeeId: person.employeeId,
        month,
        allocatedHours,
        capacityHours,
        utilizationPercent,
        overAllocated: utilizationPercent > 100,
      });
    }
  }
  return statuses;
}
