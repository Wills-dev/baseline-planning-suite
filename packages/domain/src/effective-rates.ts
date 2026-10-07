import { assertNonNegativeFinite } from './calculation-input.js';
import { parseDateOnly } from './date-only.js';
import type { DateOnly } from './date-only.js';
import type { RateRecord } from './rate-record.js';

/** Select the latest inclusive effective date for this employee, without sorting the input. */
export function getEffectiveRate(
  employeeId: string,
  date: DateOnly,
  rates: readonly RateRecord[],
): RateRecord | undefined {
  parseDateOnly(date);
  let effective: RateRecord | undefined;
  const seenDates = new Set<string>();
  for (const rate of rates) {
    if (rate.employeeId !== employeeId) continue;
    parseDateOnly(rate.validFrom);
    assertNonNegativeFinite(rate.hourlyCostEUR, 'Hourly cost');
    if (seenDates.has(rate.validFrom)) {
      throw new RangeError(
        'Employee rate records must have distinct validFrom dates',
      );
    }
    seenDates.add(rate.validFrom);
    if (
      rate.validFrom <= date &&
      (!effective || rate.validFrom > effective.validFrom)
    ) {
      effective = rate;
    }
  }
  return effective;
}
