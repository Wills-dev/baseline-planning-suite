import type {
  PlanningPeopleCapability,
  PlanningPersonSnapshot,
} from '@baseline/contracts';
import type { Employee } from '@baseline/domain';
import type { PeopleRepository } from '../persistence/people-repository';

export function createPlanningPeopleCapability(
  repository: PeopleRepository,
): PlanningPeopleCapability {
  async function snapshot(employee: Employee): Promise<PlanningPersonSnapshot> {
    return {
      employeeId: employee.id,
      name: employee.name,
      weeklyHours: employee.weeklyHours,
      rates: await repository.listRateHistory(employee.id),
    };
  }
  return {
    listPlanningPeople: async () => {
      await repository.initialize();
      return Promise.all((await repository.listEmployees()).map(snapshot));
    },
    getPlanningPerson: async (employeeId) => {
      await repository.initialize();
      const employee = await repository.getEmployee(employeeId);
      return employee ? snapshot(employee) : undefined;
    },
  };
}
