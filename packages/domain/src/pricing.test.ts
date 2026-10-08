import { describe, expect, test } from 'vitest';
import type { Allocation } from './allocation.js';
import {
  hoursToPercent,
  personMonthsToHours,
} from './allocation-conversions.js';
import { monthlyCapacityHours } from './capacity.js';
import { blendedHourlyRate, priceAllocation, costToHours } from './pricing.js';
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

test('inverse pricing reproduces the reference and retains fractional hours', () => {
  expect(costToHours(7880, 'okafor', '2026-03', rates)).toBeCloseTo(88, 12);
  const hours = 1.123456789012345;
  const cost = priceAllocation({ ...allocation, hours }, rates).totalCostEUR;
  expect(costToHours(cost, 'okafor', '2026-03', rates)).toBeCloseTo(hours, 14);
  expect(costToHours(cost, 'okafor', '2026-03', rates)).not.toBe(
    Number(hours.toFixed(4)),
  );
});
test('multiple inclusive effective periods use their actual working-day portions', () => {
  const history: RateRecord[] = [
    {
      id: '1',
      employeeId: 'okafor',
      validFrom: '2026-01-01',
      hourlyCostEUR: 80,
    },
    {
      id: '2',
      employeeId: 'okafor',
      validFrom: '2026-01-10',
      hourlyCostEUR: 90,
    },
    {
      id: '3',
      employeeId: 'okafor',
      validFrom: '2026-01-20',
      hourlyCostEUR: 100,
    },
  ];
  const result = priceAllocation(
    { ...allocation, month: '2026-01', hours: 22 },
    history,
  );
  expect(
    result.dailyPrices.filter((day) => day.hourlyCostEUR === 80),
  ).toHaveLength(7);
  expect(
    result.dailyPrices.filter((day) => day.hourlyCostEUR === 90),
  ).toHaveLength(6);
  expect(
    result.dailyPrices.filter((day) => day.hourlyCostEUR === 100),
  ).toHaveLength(9);
  expect(
    result.dailyPrices.find((day) => day.date === '2026-01-20')?.hourlyCostEUR,
  ).toBe(100);
  expect(result.totalCostEUR).toBe(2000);
  expect(costToHours(2000, 'okafor', '2026-01', history)).toBeCloseTo(22, 12);
});
test('single-rate inverse and unavailable/zero-rate inverse behavior are explicit', () => {
  const single: RateRecord[] = [
    {
      id: '1',
      employeeId: 'okafor',
      validFrom: '2025-01-01',
      hourlyCostEUR: 80,
    },
  ];
  expect(priceAllocation(allocation, single).totalCostEUR).toBe(7040);
  expect(costToHours(7040, 'okafor', '2026-03', single)).toBeCloseTo(88, 12);
  expect(() => costToHours(1, 'okafor', '2026-03', [])).toThrow(
    'no applicable rate',
  );
  expect(() =>
    costToHours(
      1,
      'okafor',
      '2026-03',
      rates.filter((rate) => rate.id === 'new'),
    ),
  ).toThrow('no applicable rate');
  expect(() =>
    costToHours(0, 'okafor', '2026-03', [{ ...single[0]!, hourlyCostEUR: 0 }]),
  ).toThrow('monthly rate is zero');
  for (const cost of [-1, NaN, Infinity])
    expect(() => costToHours(cost, 'okafor', '2026-03', rates)).toThrow();
});
