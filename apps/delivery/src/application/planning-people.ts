import { createOfficialFixtures } from '../../../../fixtures/official-seed';
import type { WeeklyHours } from '@baseline/domain';

/** Temporary Step-8 planning read model; replace this provider with People access in Step 10. */
export interface PlanningPerson {
  employeeId: string;
  name: string;
  weeklyHours: WeeklyHours;
}

export interface PlanningPeopleProvider {
  listPeople(): Promise<PlanningPerson[]>;
}

export function createFixturePlanningPeopleProvider(): PlanningPeopleProvider {
  return {
    listPeople: async () =>
      createOfficialFixtures().employees.map(({ id, name, weeklyHours }) => ({
        employeeId: id,
        name,
        weeklyHours,
      })),
  };
}
