import { describe, expect, test } from 'vitest';
import { getWorkingDays } from './working-days.js';

describe('working days', () => {
  test('March 2026 contains exactly 22 weekdays', () => {
    const days = getWorkingDays('2026-03');
    expect(days).toHaveLength(22);
    expect(days[0]).toBe('2026-03-02');
    expect(days.at(-1)).toBe('2026-03-31');
    expect(new Set(days).size).toBe(22);
    for (const day of days) {
      expect([1, 2, 3, 4, 5]).toContain(
        new Date(`${day}T00:00:00Z`).getUTCDay(),
      );
    }
    expect(days).not.toContain('2026-03-01');
    expect(days).not.toContain('2026-03-07');
  });

  test('handles leap February and December rollover', () => {
    expect(getWorkingDays('2024-02')).toHaveLength(21);
    expect(getWorkingDays('2024-02')).toContain('2024-02-29');
    expect(getWorkingDays('2026-12').at(-1)).toBe('2026-12-31');
  });

  test('rejects invalid calendar months', () => {
    expect(() => getWorkingDays('2026-13')).toThrow(RangeError);
    expect(() => getWorkingDays('2026-00')).toThrow(RangeError);
    expect(() => getWorkingDays('2026-3')).toThrow(RangeError);
  });
});
