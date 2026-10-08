import { expect, test } from 'vitest';
import { getEffectiveRate } from './effective-rates.js';
import type { RateRecord } from './rate-record.js';

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
  Object.freeze({
    id: 'other',
    employeeId: 'someone-else',
    validFrom: '2026-03-11',
    hourlyCostEUR: 999,
  }),
]);

test('looks up inclusive effective dates in unordered employee-specific history', () => {
  expect(getEffectiveRate('okafor', '2026-03-11', rates)?.hourlyCostEUR).toBe(
    80,
  );
  expect(getEffectiveRate('okafor', '2026-03-12', rates)?.hourlyCostEUR).toBe(
    95,
  );
  expect(getEffectiveRate('okafor', '2027-01-01', rates)?.hourlyCostEUR).toBe(
    95,
  );
  expect(rates.map((rate) => rate.id)).toEqual(['new', 'old', 'other']);
});

test('does not invent a rate before the first record or for another employee', () => {
  expect(getEffectiveRate('okafor', '2024-12-31', rates)).toBeUndefined();
  expect(getEffectiveRate('unknown', '2026-03-12', rates)).toBeUndefined();
});

test('rejects invalid dates, invalid costs, and ambiguous same-date history', () => {
  expect(() => getEffectiveRate('okafor', '2026-02-30', rates)).toThrow(
    RangeError,
  );
  const rate: RateRecord = {
    id: 'rate',
    employeeId: 'okafor',
    validFrom: '2026-03-01',
    hourlyCostEUR: 80,
  };
  expect(() =>
    getEffectiveRate('okafor', '2026-03-12', [
      rate,
      { ...rate, id: 'duplicate' },
    ]),
  ).toThrow(RangeError);
  expect(() =>
    getEffectiveRate('okafor', '2026-03-12', [
      { ...rate, validFrom: '2026-02-30' },
    ]),
  ).toThrow(RangeError);
  expect(() =>
    getEffectiveRate('okafor', '2026-03-12', [{ ...rate, hourlyCostEUR: NaN }]),
  ).toThrow(RangeError);
});
