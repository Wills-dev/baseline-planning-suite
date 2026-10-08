import { createOfficialFixtures } from '../../../../fixtures/official-seed';
import type { PlanningPersonSnapshot } from '@baseline/contracts';

export interface PlanningPerson extends PlanningPersonSnapshot {
  /** Retrieval failure is distinct from a successfully loaded empty rate history. */
  rateDataError?: string;
}

export interface PlanningPeopleProvider {
  listPeople(): Promise<PlanningPerson[]>;
  getPerson(employeeId: string): Promise<PlanningPerson | undefined>;
  getStatus?(): string;
}

/** Explicit standalone bootstrap mode only; never substitutes for configured authority. */
export function createFixturePlanningPeopleProvider(): PlanningPeopleProvider {
  function people(): PlanningPerson[] {
    const fixtures = createOfficialFixtures();
    return fixtures.employees.map(({ id, name, weeklyHours }) => ({
      employeeId: id,
      name,
      weeklyHours,
      rates: fixtures.rateRecords.filter((rate) => rate.employeeId === id),
    }));
  }
  return {
    listPeople: async () => people(),
    getPerson: async (employeeId) =>
      people().find((person) => person.employeeId === employeeId),
    getStatus: () =>
      'Standalone bootstrap people and rates. Configure a People remote for authoritative data.',
  };
}
