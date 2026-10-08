import { expect, test } from 'vitest';
import { monthlyCapacityHours } from './capacity.js';

test('calculates monthly capacity for each weekly schedule', () => {
  expect(monthlyCapacityHours(40, 22)).toBe(176);
  expect(monthlyCapacityHours(32, 22)).toBe(140.8);
  expect(monthlyCapacityHours(20, 22)).toBe(88);
  expect(monthlyCapacityHours(40, 0)).toBe(0);
});

test('rejects invalid working-day counts', () => {
  for (const days of [-1, 1.5, NaN, Infinity]) {
    expect(() => monthlyCapacityHours(40, days)).toThrow(RangeError);
  }
});

import { calculateCapacityStatuses, capacityKey } from './capacity';
test.each([20, 32, 40] as const)(
  'global capacity uses %sh schedules with full-precision thresholds',
  (weeklyHours) => {
    const people = [{ employeeId: 'e', weeklyHours }];
    const month = '2026-06';
    const hours = (weeklyHours * 22) / 5;
    const status = (
      values: {
        employeeId: string;
        month: '2026-06' | '2026-07';
        hours: number;
      }[],
    ) =>
      calculateCapacityStatuses(people, [month], values).get(
        capacityKey('e', month),
      )!;
    expect(status([])).toMatchObject({
      allocatedHours: 0,
      capacityHours: hours,
      utilizationPercent: 0,
      overAllocated: false,
    });
    expect(status([{ employeeId: 'e', month, hours }])).toMatchObject({
      utilizationPercent: 100,
      overAllocated: false,
    });
    expect(
      status([
        { employeeId: 'e', month, hours: hours / 2 },
        { employeeId: 'e', month, hours: hours * 0.75 },
        { employeeId: 'other', month, hours: 999 },
        { employeeId: 'e', month: '2026-07', hours: 999 },
      ]),
    ).toMatchObject({ utilizationPercent: 125, overAllocated: true });
    const fractional = status([
      { employeeId: 'e', month, hours: hours * 1.000001 },
    ]);
    expect(fractional.utilizationPercent).toBeCloseTo(100.0001, 10);
    expect(fractional.overAllocated).toBe(true);
  },
);
