import type { RateRecord, WeeklyHours } from '@baseline/domain';

/** Read-only public snapshots; People remains the data owner. */
export interface PlanningPersonSnapshot {
  employeeId: string;
  name: string;
  weeklyHours: WeeklyHours;
  rates: readonly RateRecord[];
}

export interface PlanningPeopleCapability {
  listPlanningPeople(): Promise<PlanningPersonSnapshot[]>;
  getPlanningPerson(
    employeeId: string,
  ): Promise<PlanningPersonSnapshot | undefined>;
}

/** The composition host resolves its configured public remote capability. */
export type PlanningPeopleLoader = () => Promise<PlanningPeopleCapability>;
