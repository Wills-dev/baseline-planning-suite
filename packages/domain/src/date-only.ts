export type YearMonth = `${number}-${number}`;
export type DateOnly = `${number}-${number}-${number}`;

/** Parse a calendar date without depending on the machine's local timezone. */
export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('Expected a date in YYYY-MM-DD format');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError('Invalid calendar date');
  }
  return date;
}
