import { parseDateOnly } from './date-only.js';
import type { DateOnly, YearMonth } from './date-only.js';

/** Monday-Friday calendar dates in ascending order; holidays are ignored. */
export function getWorkingDays(month: YearMonth): DateOnly[] {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new RangeError('Expected a month in YYYY-MM format');
  }
  const date = parseDateOnly(`${month}-01`);
  const monthIndex = date.getUTCMonth();
  const days: DateOnly[] = [];
  while (date.getUTCMonth() === monthIndex) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(date.toISOString().slice(0, 10) as DateOnly);
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}
