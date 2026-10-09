import type { YearMonth } from './date-only.js';

/** Input/display vocabulary; stored allocations always use hours. */
export type AllocationUnit = 'PM' | 'Hours' | 'Percent' | 'Cost';

export interface Allocation {
  id: string;
  projectId: string;
  breakdownItemId: string;
  employeeId: string;
  /** Calendar month (YYYY-MM). */
  month: YearMonth;
  hours: number;
  /** Persisted commit order; absent for legacy/fixture records with unknown edit history. */
  editSequence?: number;
}
