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

import { calculateCapacityStatuses, capacityKey } from './capacity.js';
import type { Allocation } from './allocation.js';
const month = '2026-06';
const person = { employeeId: 'e', weeklyHours: 40 as const };
function status(allocations: Allocation[], weeklyHours: 20 | 32 | 40 = 40) {
  return calculateCapacityStatuses(
    [{ ...person, weeklyHours }],
    [month],
    allocations,
  ).get(capacityKey('e', month))!;
}
function allocation(
  hours: number,
  projectId = 'a',
  employeeId = 'e',
  allocationMonth: Allocation['month'] = month,
): Allocation {
  return {
    id: `${projectId}-${employeeId}-${allocationMonth}-${hours}`,
    breakdownItemId: 'leaf',
    projectId,
    employeeId,
    month: allocationMonth,
    hours,
  };
}
test.each([20, 32, 40] as const)(
  'uses %sh weekly capacity and zero utilization',
  (weeklyHours) => {
    expect(status([], weeklyHours)).toMatchObject({
      capacityHours: (weeklyHours * 22) / 5,
      allocatedHours: 0,
      utilizationPercent: 0,
      overAllocated: false,
    });
  },
);
test('exact capacity is valid; higher and full-precision utilization warn', () => {
  expect(status([allocation(176)])).toMatchObject({
    utilizationPercent: 100,
    overAllocated: false,
  });
  expect(status([allocation(220)])).toMatchObject({
    utilizationPercent: 125,
    overAllocated: true,
  });
  const fractional = status([allocation(176 * 1.000001)]);
  expect(fractional.utilizationPercent).toBeCloseTo(100.0001, 10);
  expect(fractional.overAllocated).toBe(true);
});
test('aggregates within and across projects, excluding unrelated employee/month', () => {
  expect(
    status([
      allocation(44),
      allocation(44),
      allocation(132, 'b'),
      allocation(999, 'c', 'other'),
      allocation(999, 'c', 'e', '2026-07'),
    ]),
  ).toMatchObject({
    allocatedHours: 220,
    utilizationPercent: 125,
    overAllocated: true,
  });
});

test('same-project allocations aggregate independently of other projects', () => {
  expect(status([allocation(44), allocation(44)])).toMatchObject({
    allocatedHours: 88,
    utilizationPercent: 50,
    overAllocated: false,
  });
});
