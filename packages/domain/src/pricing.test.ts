import { describe, expect, test } from 'vitest';
import type { Allocation } from './allocation.js';
import {
  hoursToPercent,
  personMonthsToHours,
} from './allocation-conversions.js';
import { monthlyCapacityHours } from './capacity.js';
import { blendedHourlyRate, priceAllocation } from './pricing.js';
import type { RateRecord } from './rate-record.js';
import { getWorkingDays } from './working-days.js';

const allocation: Allocation = Object.freeze({
  id: 'allocation',
  projectId: 'project',
  breakdownItemId: 'activity',
  employeeId: 'okafor',
  month: '2026-03',
  hours: 88,
});
const rates: readonly RateRecord[] = Object.freeze([
  Object.freeze({
    id: 'new',
    employeeId: 'okafor',
    validFrom: '2026-03-12',
    hourlyCostEUR: 95,
  }),
  Object.freeze({
    id: 'old',
    employeeId: 'okafor',
    validFrom: '2025-01-01',
    hourlyCostEUR: 80,
  }),
]);

describe('monthly allocation pricing', () => {
  test('reproduces A. Okafor reference scenario exactly', () => {
    const days = getWorkingDays(allocation.month);
    const capacity = monthlyCapacityHours(40, days.length);
    const hours = personMonthsToHours(0.5, capacity);
    const result = priceAllocation({ ...allocation, hours }, rates);
    expect(days).toHaveLength(22);
    expect(capacity).toBe(176);
    expect(hours).toBe(88);
    expect(hoursToPercent(hours, capacity)).toBe(50);
    expect(result.hoursPerWorkingDay).toBe(4);
    const oldDays = result.dailyPrices.filter(
      (day) => day.hourlyCostEUR === 80,
    );
    const newDays = result.dailyPrices.filter(
      (day) => day.hourlyCostEUR === 95,
    );
    expect(oldDays).toHaveLength(8);
    expect(newDays).toHaveLength(14);
    expect(oldDays.reduce((sum, day) => sum + day.costEUR, 0)).toBe(2560);
    expect(newDays.reduce((sum, day) => sum + day.costEUR, 0)).toBe(5320);
    expect(result.totalCostEUR).toBe(7880);
    expect(result.missingRateDays).toEqual([]);
    expect(blendedHourlyRate(result.totalCostEUR, hours)).toBeCloseTo(
      89.54545454545455,
      12,
    );
    expect(allocation.hours).toBe(88);
    expect(rates.map((rate) => rate.id)).toEqual(['new', 'old']);
  });

  test('prices a month before the first rate at zero and exposes every missing day', () => {
    const result = priceAllocation({ ...allocation, month: '2024-12' }, rates);
    expect(result.totalCostEUR).toBe(0);
    expect(result.missingRateDays).toEqual(getWorkingDays('2024-12'));
    expect(
      result.dailyPrices.every(
        (day) => day.hourlyCostEUR === null && day.costEUR === 0,
      ),
    ).toBe(true);
  });

  test('prices only covered days when the first rate starts mid-month', () => {
    const result = priceAllocation(
      allocation,
      rates.filter((rate) => rate.id === 'new'),
    );
    expect(result.missingRateDays).toEqual(
      getWorkingDays('2026-03').filter((day) => day < '2026-03-12'),
    );
    expect(result.missingRateDays).toHaveLength(8);
    expect(result.totalCostEUR).toBe(5320);
    expect(
      result.dailyPrices.filter((day) => day.hourlyCostEUR === null),
    ).toHaveLength(8);
  });

  test('distinguishes a real zero-cost rate from missing rates', () => {
    const result = priceAllocation(allocation, [
      {
        id: 'free',
        employeeId: 'okafor',
        validFrom: '2026-01-01',
        hourlyCostEUR: 0,
      },
    ]);
    expect(result.totalCostEUR).toBe(0);
    expect(result.missingRateDays).toEqual([]);
    expect(result.dailyPrices.every((day) => day.hourlyCostEUR === 0)).toBe(
      true,
    );
  });

  test('handles zero hours without NaN or Infinity, retaining missing-rate information', () => {
    const result = priceAllocation({ ...allocation, hours: 0 }, rates);
    expect(result.hoursPerWorkingDay).toBe(0);
    expect(result.totalCostEUR).toBe(0);
    expect(blendedHourlyRate(0, 0)).toBe(0);
    expect(
      priceAllocation({ ...allocation, hours: 0 }, []).missingRateDays,
    ).toHaveLength(22);
  });

  test('keeps fractional costs and hours unrounded', () => {
    const hours = 1.123456789;
    const result = priceAllocation({ ...allocation, hours }, rates);
    expect(result.hoursPerWorkingDay).toBe(hours / 22);
    expect(result.totalCostEUR).toBeCloseTo(
      (hours / 22) * (8 * 80 + 14 * 95),
      12,
    );
    expect(blendedHourlyRate(result.totalCostEUR, hours)).toBeCloseTo(
      (8 * 80 + 14 * 95) / 22,
      12,
    );
  });

  test('rejects invalid allocation and blended rate quantities', () => {
    for (const hours of [-1, NaN, Infinity]) {
      expect(() => priceAllocation({ ...allocation, hours }, rates)).toThrow(
        RangeError,
      );
      expect(() => blendedHourlyRate(100, hours)).toThrow(RangeError);
    }
    expect(() => blendedHourlyRate(NaN, 88)).toThrow(RangeError);
  });
});
