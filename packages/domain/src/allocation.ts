export type AllocationUnit = 'PM' | 'Hours' | 'Percent' | 'Cost';

/** Supplied allocation vocabulary; the canonical representation is not yet decided. */
export interface Allocation {
  id: string;
  projectId: string;
  breakdownItemId: string;
  employeeId: string;
  /** Calendar month (YYYY-MM). */
  month: string;
  value: number;
  unit: AllocationUnit;
}
