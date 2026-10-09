import type { WeeklyHours, YearMonth } from '@baseline/domain';

/** People supplies its authoritative schedules; Delivery owns allocation aggregation. */
export interface CapacityPerson {
  employeeId: string;
  weeklyHours: WeeklyHours;
}
export interface PersonCapacitySnapshot {
  employeeId: string;
  oversubscribedMonths: readonly YearMonth[];
}
export interface DeliveryCapacityCapability {
  listCapacityStatuses(
    people: readonly CapacityPerson[],
  ): Promise<PersonCapacitySnapshot[]>;
}
export type DeliveryCapacityLoader = () => Promise<DeliveryCapacityCapability>;
