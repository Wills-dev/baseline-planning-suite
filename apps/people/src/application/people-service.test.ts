import { describe, expect, test, vi } from 'vitest';
import type { PeopleRepository } from '../persistence/people-repository';
import { createPeopleFixtures } from '../persistence/fixtures';
import {
  createPeopleService,
  searchEmployees,
  validateRateInput,
} from './people-service';

function memoryRepository(): PeopleRepository {
  const { employees, rateRecords } = createPeopleFixtures();
  const rates = new Map(rateRecords.map((rate) => [rate.id, rate]));
  return {
    initialize: vi.fn(async () => undefined),
    listEmployees: async () => employees,
    getEmployee: async (id) => employees.find((employee) => employee.id === id),
    listRateHistory: async (employeeId) =>
      [...rates.values()]
        .filter((rate) => rate.employeeId === employeeId)
        .sort((left, right) => left.validFrom.localeCompare(right.validFrom)),
    getRateRecord: async (id) => rates.get(id),
    addRateRecord: async (record) => {
      if (rates.has(record.id)) throw new Error('Duplicate ID');
      rates.set(record.id, record);
    },
    updateRateRecord: async (record) => {
      if (!rates.has(record.id)) throw new Error('Missing rate');
      rates.set(record.id, record);
    },
    deleteRateRecord: async (id) => {
      rates.delete(id);
    },
    close: async () => undefined,
  };
}

describe('People search and input validation', () => {
  test('searches case-insensitively by employee name and role without mutating input', () => {
    const employees = createPeopleFixtures().employees;
    expect(
      searchEmployees(employees, '  a. oKAFOr  ').map(
        (employee) => employee.id,
      ),
    ).toEqual(['employee-01']);
    expect(searchEmployees(employees, 'FRONTEND ENGINEER')).toHaveLength(12);
    expect(searchEmployees(employees, 'no-such-person')).toEqual([]);
    expect(searchEmployees(employees, '')).toHaveLength(60);
    expect(employees).toHaveLength(60);
  });

  test('accepts zero and fractional EUR rates without display rounding', () => {
    expect(
      validateRateInput({ validFrom: '2024-02-29', hourlyCostEUR: '0' }, []),
    ).toEqual({ validFrom: '2024-02-29', hourlyCostEUR: 0 });
    expect(
      validateRateInput(
        { validFrom: '2026-03-12', hourlyCostEUR: '95.123456' },
        [],
      ).hourlyCostEUR,
    ).toBe(95.123456);
  });

  test.each([
    '',
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-3-1',
    '2026-03-12T00:00:00Z',
  ])('rejects invalid calendar date %s', (validFrom) => {
    expect(() =>
      validateRateInput({ validFrom, hourlyCostEUR: '95' }, []),
    ).toThrow('valid effective-from date');
  });

  test.each(['', ' ', '-1', 'NaN', 'Infinity', 'not-a-number'])(
    'rejects invalid hourly rate %s',
    (hourlyCostEUR) => {
      expect(() =>
        validateRateInput({ validFrom: '2026-03-12', hourlyCostEUR }, []),
      ).toThrow('finite EUR hourly rate');
    },
  );

  test('rejects duplicate dates but permits an edited record to retain its own date', () => {
    const rates = createPeopleFixtures().rateRecords.filter(
      (rate) => rate.employeeId === 'employee-01',
    );
    const input = { validFrom: '2026-03-12', hourlyCostEUR: '100' };
    expect(() => validateRateInput(input, rates)).toThrow('already has a rate');
    expect(
      validateRateInput(input, rates, 'employee-01-rate-2').hourlyCostEUR,
    ).toBe(100);
    expect(() => validateRateInput(input, rates, 'employee-01-rate-1')).toThrow(
      'already has a rate',
    );
  });
});

describe('People repository-facing orchestration', () => {
  test('loads employees and selected employee reference history', async () => {
    const repository = memoryRepository();
    const service = createPeopleService(repository);
    expect(await service.listEmployees()).toHaveLength(60);
    expect(repository.initialize).toHaveBeenCalledOnce();
    expect(
      (await service.listRateHistory('employee-01')).map((rate) => [
        rate.validFrom,
        rate.hourlyCostEUR,
      ]),
    ).toEqual([
      ['2025-01-01', 80],
      ['2026-03-12', 95],
    ]);
  });

  test('adds, edits, and deletes through repository operations, returning refreshed history', async () => {
    const repository = memoryRepository();
    const service = createPeopleService(repository, () => 'user-created-rate');
    const added = await service.saveRate('employee-01', {
      validFrom: '2027-01-01',
      hourlyCostEUR: '101.12345',
    });
    expect(added).toHaveLength(3);
    expect(await repository.getRateRecord('user-created-rate')).toMatchObject({
      employeeId: 'employee-01',
      validFrom: '2027-01-01',
      hourlyCostEUR: 101.12345,
    });
    const edited = await service.saveRate(
      'employee-01',
      { validFrom: '2027-02-01', hourlyCostEUR: '102' },
      'user-created-rate',
    );
    expect(edited.at(-1)).toMatchObject({
      id: 'user-created-rate',
      employeeId: 'employee-01',
      validFrom: '2027-02-01',
      hourlyCostEUR: 102,
    });
    expect(
      await service.deleteRate('employee-01', 'user-created-rate'),
    ).toHaveLength(2);
    expect(await repository.getRateRecord('user-created-rate')).toBeUndefined();
  });

  test('rejects duplicates against freshly fetched history before add or update', async () => {
    const repository = memoryRepository();
    const service = createPeopleService(repository, () => 'new-rate');
    await expect(
      service.saveRate('employee-01', {
        validFrom: '2026-03-12',
        hourlyCostEUR: '100',
      }),
    ).rejects.toThrow('already has a rate');
    await expect(
      service.saveRate(
        'employee-01',
        { validFrom: '2025-01-01', hourlyCostEUR: '100' },
        'employee-01-rate-2',
      ),
    ).rejects.toThrow('already has a rate');
    expect(await repository.getRateRecord('new-rate')).toBeUndefined();
    expect(
      (await repository.getRateRecord('employee-01-rate-2'))?.hourlyCostEUR,
    ).toBe(95);
  });

  test('requires an existing employee and prevents cross-employee edits or deletions', async () => {
    const repository = memoryRepository();
    const service = createPeopleService(repository);
    await expect(
      service.saveRate('missing', {
        validFrom: '2027-01-01',
        hourlyCostEUR: '95',
      }),
    ).rejects.toThrow('employee no longer exists');
    await expect(
      service.saveRate(
        'employee-02',
        { validFrom: '2027-01-01', hourlyCostEUR: '95' },
        'employee-01-rate-2',
      ),
    ).rejects.toThrow('selected employee');
    await expect(
      service.deleteRate('employee-02', 'employee-01-rate-2'),
    ).rejects.toThrow('selected employee');
    expect(await repository.getRateRecord('employee-01-rate-2')).toBeDefined();
  });

  test('propagates persistence failures for the page to present, without claiming success', async () => {
    const repository = memoryRepository();
    vi.spyOn(repository, 'addRateRecord').mockRejectedValue(
      new Error('Storage unavailable'),
    );
    const service = createPeopleService(repository, () => 'new-rate');
    await expect(
      service.saveRate('employee-01', {
        validFrom: '2027-01-01',
        hourlyCostEUR: '100',
      }),
    ).rejects.toThrow('Storage unavailable');
    expect(await repository.getRateRecord('new-rate')).toBeUndefined();
  });
});
