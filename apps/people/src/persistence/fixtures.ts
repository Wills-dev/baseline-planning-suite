import type { Employee, RateRecord } from '@baseline/domain';
import { createOfficialFixtures } from '../../../../fixtures/official-seed';
export interface PeopleFixtures {
  employees: Employee[];
  rateRecords: RateRecord[];
}
export function createPeopleFixtures(): PeopleFixtures {
  const { employees, rateRecords } = createOfficialFixtures();
  return { employees, rateRecords };
}
