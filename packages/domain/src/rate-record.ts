export interface RateRecord {
  id: string;
  employeeId: string;
  /** Inclusive date (YYYY-MM-DD); effective until the next rate record. */
  validFrom: string;
  hourlyCostEUR: number;
}
