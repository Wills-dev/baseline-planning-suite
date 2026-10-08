import { describe, expect, test } from 'vitest';
import {
  hoursToPercent,
  hoursToPersonMonths,
  percentToHours,
  personMonthsToHours,
} from './allocation-conversions.js';

describe('allocation boundary conversions', () => {
  test('converts PM and percent using 176 hours of capacity', () => {
    expect(personMonthsToHours(0.5, 176)).toBe(88);
    expect(hoursToPersonMonths(88, 176)).toBe(0.5);
    expect(percentToHours(50, 176)).toBe(88);
    expect(hoursToPercent(88, 176)).toBe(50);
  });

  test('round trips fractional hours without display rounding or changing the original', () => {
    const hours = 13.123456789;
    const capacity = 140.8;
    expect(
      personMonthsToHours(hoursToPersonMonths(hours, capacity), capacity),
    ).toBeCloseTo(hours, 12);
    expect(
      percentToHours(hoursToPercent(hours, capacity), capacity),
    ).toBeCloseTo(hours, 12);
    expect(hours).toBe(13.123456789);
    expect(percentToHours(125, 176)).toBe(220);
  });

  test('handles zero values and rejects division by zero for positive hours', () => {
    expect(personMonthsToHours(0, 176)).toBe(0);
    expect(percentToHours(0, 176)).toBe(0);
    expect(personMonthsToHours(0.5, 0)).toBe(0);
    expect(percentToHours(50, 0)).toBe(0);
    expect(hoursToPersonMonths(0, 0)).toBe(0);
    expect(hoursToPercent(0, 0)).toBe(0);
    expect(() => hoursToPersonMonths(88, 0)).toThrow(RangeError);
    expect(() => hoursToPercent(88, 0)).toThrow(RangeError);
  });

  test('rejects negative and non-finite quantities', () => {
    for (const invalid of [-1, NaN, Infinity]) {
      expect(() => personMonthsToHours(invalid, 176)).toThrow(RangeError);
      expect(() => hoursToPersonMonths(88, invalid)).toThrow(RangeError);
      expect(() => percentToHours(invalid, 176)).toThrow(RangeError);
      expect(() => hoursToPercent(invalid, 176)).toThrow(RangeError);
    }
  });
});
