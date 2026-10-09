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
  /** Calendar month before the first employee rate is a marked zero-cost month. */
  rateStatus: 'priced' | 'before-first-rate' | 'missing-rate';
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
  const firstRate = rates
    .filter((rate) => rate.employeeId === allocation.employeeId)
    .map((rate) => rate.validFrom)
    .sort()[0];
  const rateStatus =
    firstRate && allocation.month < firstRate.slice(0, 7)
      ? 'before-first-rate'
      : missingRateDays.length
        ? 'missing-rate'
        : 'priced';
  return {
    rateStatus,
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

/** Invert the same evenly distributed working-day pricing model, without rounding hours. */
export function costToHours(
  costEUR: number,
  employeeId: string,
  month: Allocation['month'],
  rates: readonly RateRecord[],
): number {
  assertNonNegativeFinite(costEUR, 'Allocation cost');
  const unitPrice = priceAllocation(
    { id: '', projectId: '', breakdownItemId: '', employeeId, month, hours: 1 },
    rates,
  );
  if (unitPrice.missingRateDays.length)
    throw new RangeError('Cost unavailable: no applicable rate.');
  if (unitPrice.totalCostEUR === 0)
    throw new RangeError(
      'Cost editing unavailable: monthly rate is zero. Use Hours, PM or % capacity.',
    );
  const hours = costEUR / unitPrice.totalCostEUR;
  assertNonNegativeFinite(hours, 'Converted allocation hours');
  return hours;
}
