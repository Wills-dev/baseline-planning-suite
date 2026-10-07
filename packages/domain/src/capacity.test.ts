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
