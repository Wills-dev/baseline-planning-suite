import { expect, test } from 'vitest';
import {
  reconcileRoundedUnits,
  reconcileRoundedValues,
} from './display-rounding';

test.each([
  [[], 2, []],
  [[1.234], 2, [1.23]],
  [[1.2, 2.3], 1, [1.2, 2.3]],
  [[33.333, 33.333, 33.334], 1, [33.3, 33.3, 33.4]],
  [[10.005, 10.005], 2, [10.01, 10]],
  [[0, 0], 2, [0, 0]],
  [[0, 0.005, 0.005], 2, [0, 0.01, 0]],
  [[0.006, 0.006, 0.006], 2, [0.01, 0.01, 0]],
  [[0.1, 0.2], 2, [0.1, 0.2]],
  [[1.005], 2, [1.01]],
  [[1.005, 2.005], 2, [1.01, 2]],
  [[0.29, 0.58], 2, [0.29, 0.58]],
])('reconciles %j at %i decimal places', (values, precision, expected) => {
  expect(
    reconcileRoundedValues(values as number[], precision as number),
  ).toEqual(expected);
});

test('many children conserve integer display units and leave input untouched', () => {
  const values = Object.freeze(Array.from({ length: 1000 }, () => 0.0033));
  const units = reconcileRoundedUnits(values, 2);
  expect(units.reduce((sum, value) => sum + value, 0)).toBe(330);
  expect(units.slice(0, 330)).toEqual(Array(330).fill(1));
  expect(units.slice(330)).toEqual(Array(670).fill(0));
  expect(values).toEqual(Array(1000).fill(0.0033));
});

test('inherited parent targets reconcile intermediate sibling groups', () => {
  expect(reconcileRoundedUnits([0.004, 0.004], 2, 0)).toEqual([0, 0]);
  expect(reconcileRoundedUnits([0.004, 0.004], 2, 1)).toEqual([1, 0]);
});

test.each([-1, 1.5, 7, NaN, Infinity])(
  'rejects invalid precision %s',
  (precision) => {
    expect(() => reconcileRoundedValues([], precision)).toThrow(RangeError);
  },
);

test.each([NaN, Infinity, -Infinity, -1, Number.MAX_VALUE])(
  'rejects invalid value %s',
  (value) => {
    expect(() => reconcileRoundedValues([value], 2)).toThrow(RangeError);
  },
);

test('rejects unsafe totals and infeasible parent targets', () => {
  expect(() =>
    reconcileRoundedUnits(
      [Number.MAX_SAFE_INTEGER / 2, Number.MAX_SAFE_INTEGER / 2],
      0,
    ),
  ).toThrow();
  expect(() => reconcileRoundedUnits([1], 2, 105)).toThrow();
});
