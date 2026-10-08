import { publishPeopleRateChanged } from '@baseline/contracts';
import type { DateOnly, Employee, RateRecord } from '@baseline/domain';
import type { PeopleRepository } from '../persistence/people-repository';

export interface RateInput {
  validFrom: string;
  hourlyCostEUR: string;
}

export class RateInputError extends Error {}

export function searchEmployees(
  employees: readonly Employee[],
  query: string,
): Employee[] {
  const search = query.trim().toLocaleLowerCase();
  return employees.filter((employee) =>
    `${employee.name} ${employee.role}`.toLocaleLowerCase().includes(search),
  );
}

export function validateRateInput(
  input: RateInput,
  history: readonly RateRecord[],
  editingId?: string,
): { validFrom: DateOnly; hourlyCostEUR: number } {
  const validFrom = input.validFrom;
  const date = new Date(`${validFrom}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(validFrom) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== validFrom
  ) {
    throw new RateInputError('Enter a valid effective-from date.');
  }
  const hourlyCostEUR = Number(input.hourlyCostEUR);
  if (
    !input.hourlyCostEUR.trim() ||
    !Number.isFinite(hourlyCostEUR) ||
    hourlyCostEUR < 0
  ) {
    throw new RateInputError('Enter a finite EUR hourly rate of zero or more.');
  }
  if (
    history.some(
      (rate) => rate.id !== editingId && rate.validFrom === validFrom,
    )
  ) {
    throw new RateInputError(
      'This employee already has a rate starting on that date. Choose another date.',
    );
  }
  return { validFrom: validFrom as DateOnly, hourlyCostEUR };
}

/** Owner-specific orchestration; components never access persistence primitives. */
export function createPeopleService(
  repository: PeopleRepository,
  createId: () => string = () => crypto.randomUUID(),
  publish: typeof publishPeopleRateChanged = publishPeopleRateChanged,
) {
  async function requireEmployee(employeeId: string): Promise<void> {
    if (!(await repository.getEmployee(employeeId)))
      throw new RateInputError(
        'The selected employee no longer exists. Reload the employee register.',
      );
  }

  async function requireOwnedRate(
    employeeId: string,
    id: string,
  ): Promise<RateRecord> {
    const rate = await repository.getRateRecord(id);
    if (!rate || rate.employeeId !== employeeId)
      throw new RateInputError(
        'This rate is no longer available for the selected employee. Reload the rate history.',
      );
    return rate;
  }

  return {
    listEmployees: async () => {
      await repository.initialize();
      return repository.listEmployees();
    },
    listRateHistory: (employeeId: string) =>
      repository.listRateHistory(employeeId),
    saveRate: async (
      employeeId: string,
      input: RateInput,
      editingId?: string,
    ) => {
      await requireEmployee(employeeId);
      const existing = editingId
        ? await requireOwnedRate(employeeId, editingId)
        : undefined;
      const history = await repository.listRateHistory(employeeId);
      const fields = validateRateInput(input, history, editingId);
      const record: RateRecord = {
        id: existing?.id ?? createId(),
        employeeId,
        ...fields,
      };
      if (existing) await repository.updateRateRecord(record);
      else await repository.addRateRecord(record);
      publish({ employeeId });
      return repository.listRateHistory(employeeId);
    },
    deleteRate: async (employeeId: string, id: string) => {
      await requireEmployee(employeeId);
      await requireOwnedRate(employeeId, id);
      await repository.deleteRateRecord(id);
      publish({ employeeId });
      return repository.listRateHistory(employeeId);
    },
  };
}
