import type { Allocation } from './allocation.js';
import { assertNonNegativeFinite } from './calculation-input.js';
import type { DateOnly } from './date-only.js';
import { getEffectiveRate } from './effective-rates.js';
import type { RateRecord } from './rate-record.js';
import { getWorkingDays } from './working-days.js';

export interface DailyAllocationPrice {
  date: DateOnly;
  allocationHours: number;
  /** null means no effective rate; a real zero-cost rate is represented by 0. */
  hourlyCostEUR: number | null;
  costEUR: number;
}

export interface AllocationPricingResult {
  totalCostEUR: number;
  hoursPerWorkingDay: number;
  missingRateDays: DateOnly[];
  dailyPrices: DailyAllocationPrice[];
}

/** Spread canonical hours evenly over working days and sum unrounded daily costs. */
export function priceAllocation(
  allocation: Allocation,
  rates: readonly RateRecord[],
): AllocationPricingResult {
  assertNonNegativeFinite(allocation.hours, 'Allocation hours');
  const workingDays = getWorkingDays(allocation.month);
  const hoursPerWorkingDay = allocation.hours / workingDays.length;
  const missingRateDays: DateOnly[] = [];
  const dailyPrices = workingDays.map((date): DailyAllocationPrice => {
    const rate = getEffectiveRate(allocation.employeeId, date, rates);
    if (!rate) missingRateDays.push(date);
    return {
      date,
      allocationHours: hoursPerWorkingDay,
      hourlyCostEUR: rate?.hourlyCostEUR ?? null,
      costEUR: rate ? hoursPerWorkingDay * rate.hourlyCostEUR : 0,
    };
  });
  return {
    totalCostEUR: dailyPrices.reduce((total, day) => total + day.costEUR, 0),
    hoursPerWorkingDay,
    missingRateDays,
    dailyPrices,
  };
}

/** Zero hours have no blended rate contribution and return 0, including unpriced allocations. */
export function blendedHourlyRate(
  totalCostEUR: number,
  allocationHours: number,
): number {
  assertNonNegativeFinite(totalCostEUR, 'Total cost');
  assertNonNegativeFinite(allocationHours, 'Allocation hours');
  return allocationHours === 0 ? 0 : totalCostEUR / allocationHours;
}
