import { expect, test } from 'vitest';
import type {
  Allocation,
  AllocationUnit,
  BreakdownItem,
} from '@baseline/domain';
import {
  derivePlanningDisplay,
  deriveWbsHoursDisplay,
  formatDisplayValue,
  formatInputValue,
} from './display-values';
import { buildWbsTree } from './wbs';
import { inputToHours } from './allocation-values';

const items: BreakdownItem[] = [
  { id: 'root', projectId: 'p', name: 'Root', type: 'Deliverable' },
  ...['a', 'b'].map((id) => ({
    id,
    projectId: 'p',
    name: id,
    type: 'WorkPackage' as const,
    parentId: 'root',
  })),
  ...['a1', 'a2', 'b1', 'b2'].map((id) => ({
    id,
    projectId: 'p',
    name: id,
    type: 'Activity' as const,
    parentId: id[0],
  })),
];
const tree = buildWbsTree(items);
const person = {
  employeeId: 'e',
  name: 'Employee',
  weeklyHours: 40 as const,
  rates: [
    {
      id: 'r1',
      employeeId: 'e',
      validFrom: '2025-01-01' as const,
      hourlyCostEUR: 80,
    },
    {
      id: 'r2',
      employeeId: 'e',
      validFrom: '2026-03-12' as const,
      hourlyCostEUR: 95,
    },
  ],
};
function allocations(hours: number): Allocation[] {
  return ['a1', 'a2', 'b1', 'b2'].map((id) => ({
    id,
    projectId: 'p',
    breakdownItemId: id,
    employeeId: 'e',
    month: '2026-03',
    hours,
  }));
}
function checkHierarchy(values: Map<string, number | null>, scale: number) {
  const units = (id: string) => Math.round((values.get(id) ?? NaN) * scale);
  expect(units('a1') + units('a2')).toBe(units('a'));
  expect(units('b1') + units('b2')).toBe(units('b'));
  expect(units('a') + units('b')).toBe(units('root'));
}

test.each([
  ['Hours', 0.004, 100],
  ['PM', 0.004 * 176, 100],
  ['Percent', (0.04 * 176) / 100, 10],
  ['Cost', 0.004 / (7880 / 88), 100],
] as const)(
  '%s reconciles multiple three-level sibling groups without changing hours',
  (unit, hours, scale) => {
    const records = allocations(hours);
    const before = structuredClone(records);
    const values = derivePlanningDisplay(
      tree,
      records,
      person,
      '2026-03',
      unit,
    );
    checkHierarchy(values, scale);
    // Both groups independently round to one display unit, but the root has two.
    expect(values.get('root')).toBe(2 / scale);
    expect(records).toEqual(before);
  },
);

test('intermediate parents inherit assigned totals rather than independently rounding again', () => {
  const records = allocations(0.003);
  const values = derivePlanningDisplay(
    tree,
    records,
    person,
    '2026-03',
    'Hours',
  );
  expect(values.get('root')).toBe(0.01);
  expect(values.get('a')).toBe(0.01);
  expect(values.get('b')).toBe(0);
  checkHierarchy(values, 100);
  checkHierarchy(deriveWbsHoursDisplay(items, records), 100);
});

test('Cost prices each allocation with its owner history, including multiple effective dates', () => {
  const records = allocations(22);
  const values = derivePlanningDisplay(
    tree,
    records,
    person,
    '2026-03',
    'Cost',
  );
  expect(values.get('root')).toBe(7880);
  checkHierarchy(values, 100);
  const other = {
    ...person,
    employeeId: 'other',
    rates: [
      {
        id: 'other-rate',
        employeeId: 'other',
        validFrom: '2025-01-01' as const,
        hourlyCostEUR: 20,
      },
    ],
  };
  const otherRecords = records.map((record) => ({
    ...record,
    employeeId: 'other',
  }));
  expect(
    derivePlanningDisplay(tree, otherRecords, other, '2026-03', 'Cost').get(
      'root',
    ),
  ).toBe(1760);
});

test('unavailable Cost propagates to parents and zero rates remain genuine zero', () => {
  const records = allocations(22);
  const unavailable = derivePlanningDisplay(
    tree,
    records,
    { ...person, rates: [] },
    '2026-03',
    'Cost',
  );
  expect([...unavailable.values()].every((value) => value === null)).toBe(true);
  const zero = derivePlanningDisplay(
    tree,
    records,
    {
      ...person,
      rates: person.rates.map((rate) => ({ ...rate, hourlyCostEUR: 0 })),
    },
    '2026-03',
    'Cost',
  );
  expect([...zero.values()].every((value) => value === 0)).toBe(true);
});

test.each([
  ['Hours', '88.00'],
  ['PM', '0.50'],
  ['Percent', '50.0'],
  ['Cost', '€7,880.00'],
] as const)('centralizes %s precision', (unit, expected) => {
  const value =
    unit === 'PM' ? 0.5 : unit === 'Percent' ? 50 : unit === 'Cost' ? 7880 : 88;
  expect(formatDisplayValue(value, unit)).toBe(expected);
  expect(formatInputValue(value, unit)).toBe(
    unit === 'Cost' ? '7880.00' : expected,
  );
});

test('input conversions preserve full precision independently of displayed reconciliation', () => {
  const exact = 87.99999999997;
  expect(formatInputValue(exact, 'Hours')).toBe('88.00');
  expect(inputToHours(String(exact), 'Hours', person, '2026-03')).toBe(exact);
  for (const unit of ['PM', 'Percent', 'Cost'] as AllocationUnit[]) {
    const entered = '0.123456789123';
    const hours = inputToHours(entered, unit, person, '2026-03');
    expect(hours).not.toBe(Number(hours.toFixed(2)));
  }
});

test('unavailable subtrees do not fabricate parent Cost or suppress available siblings', async () => {
  const { reconcileWbsDisplay } = await import('./display-values');
  const values = reconcileWbsDisplay(
    tree,
    new Map([
      ['a1', null],
      ['a2', 10.005],
      ['b1', 10.005],
      ['b2', 10.005],
    ]),
    2,
  );
  expect(values.get('root')).toBeNull();
  expect(values.get('a')).toBeNull();
  expect(values.get('a1')).toBeNull();
  expect(values.get('a2')).toBe(10.01);
  expect(values.get('b')).toBe(20.01);
  expect(
    Math.round(values.get('b1')! * 100) + Math.round(values.get('b2')! * 100),
  ).toBe(2001);
});
