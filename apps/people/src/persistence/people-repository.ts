import type { Employee, RateRecord } from '@baseline/domain';
import { createDatabase } from '@baseline/persistence';
import { createPeopleFixtures } from './fixtures';

export interface PeopleRepository {
  initialize(): Promise<void>;
  listEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  listRateHistory(employeeId: string): Promise<RateRecord[]>;
  getRateRecord(id: string): Promise<RateRecord | undefined>;
  addRateRecord(record: RateRecord): Promise<void>;
  updateRateRecord(record: RateRecord): Promise<void>;
  deleteRateRecord(id: string): Promise<void>;
  close(): Promise<void>;
}

interface PeopleStores {
  employees: Employee;
  rateRecords: RateRecord;
}

export function createPeopleRepository(): PeopleRepository {
  const database = createDatabase<PeopleStores>({
    name: 'baseline-planning-people',
    version: 1,
    stores: [
      { name: 'employees' },
      {
        name: 'rateRecords',
        indexes: [{ name: 'employeeId', keyPath: 'employeeId' }],
      },
    ],
    seed: createPeopleFixtures,
  });
  return {
    initialize: database.initialize,
    listEmployees: () => database.list('employees'),
    getEmployee: (id) => database.get('employees', id),
    listRateHistory: async (employeeId) => {
      const history = await database.listByIndex(
        'rateRecords',
        'employeeId',
        employeeId,
      );
      return history.sort((left, right) =>
        left.validFrom.localeCompare(right.validFrom),
      );
    },
    getRateRecord: (id) => database.get('rateRecords', id),
    addRateRecord: (record) => database.add('rateRecords', record),
    updateRateRecord: async (record) => {
      if (!(await database.get('rateRecords', record.id)))
        throw new Error(`Rate record ${record.id} does not exist`);
      await database.put('rateRecords', record);
    },
    deleteRateRecord: (id) => database.delete('rateRecords', id),
    close: database.close,
  };
}
