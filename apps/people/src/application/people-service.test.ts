import { createPlanningPeopleCapability } from './planning-capability';
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
      searchEmployees(employees, '  Adaeze oKAFOr  ').map(
        (employee) => employee.id,
      ),
    ).toEqual(['emp-001']);
    expect(searchEmployees(employees, 'FRONTEND ENGINEER')).toEqual(
      employees.filter((employee) => employee.role === 'Frontend Engineer'),
    );
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
      (rate) => rate.employeeId === 'emp-001',
    );
    const input = { validFrom: '2026-03-12', hourlyCostEUR: '100' };
    expect(() => validateRateInput(input, rates)).toThrow('already has a rate');
    expect(validateRateInput(input, rates, 'rate-002').hourlyCostEUR).toBe(100);
    expect(() => validateRateInput(input, rates, 'rate-001')).toThrow(
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
      (await service.listRateHistory('emp-001')).map((rate) => [
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
    const added = await service.saveRate('emp-001', {
      validFrom: '2027-01-01',
      hourlyCostEUR: '101.12345',
    });
    expect(added).toHaveLength(3);
    expect(await repository.getRateRecord('user-created-rate')).toMatchObject({
      employeeId: 'emp-001',
      validFrom: '2027-01-01',
      hourlyCostEUR: 101.12345,
    });
    const edited = await service.saveRate(
      'emp-001',
      { validFrom: '2027-02-01', hourlyCostEUR: '102' },
      'user-created-rate',
    );
    expect(edited.at(-1)).toMatchObject({
      id: 'user-created-rate',
      employeeId: 'emp-001',
      validFrom: '2027-02-01',
      hourlyCostEUR: 102,
    });
    expect(
      await service.deleteRate('emp-001', 'user-created-rate'),
    ).toHaveLength(2);
    expect(await repository.getRateRecord('user-created-rate')).toBeUndefined();
  });

  test('rejects duplicates against freshly fetched history before add or update', async () => {
    const repository = memoryRepository();
    const service = createPeopleService(repository, () => 'new-rate');
    await expect(
      service.saveRate('emp-001', {
        validFrom: '2026-03-12',
        hourlyCostEUR: '100',
      }),
    ).rejects.toThrow('already has a rate');
    await expect(
      service.saveRate(
        'emp-001',
        { validFrom: '2025-01-01', hourlyCostEUR: '100' },
        'rate-002',
      ),
    ).rejects.toThrow('already has a rate');
    expect(await repository.getRateRecord('new-rate')).toBeUndefined();
    expect((await repository.getRateRecord('rate-002'))?.hourlyCostEUR).toBe(
      95,
    );
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
        'emp-002',
        { validFrom: '2027-01-01', hourlyCostEUR: '95' },
        'rate-002',
      ),
    ).rejects.toThrow('selected employee');
    await expect(service.deleteRate('emp-002', 'rate-002')).rejects.toThrow(
      'selected employee',
    );
    expect(await repository.getRateRecord('rate-002')).toBeDefined();
  });

  test('propagates persistence failures for the page to present, without claiming success', async () => {
    const repository = memoryRepository();
    vi.spyOn(repository, 'addRateRecord').mockRejectedValue(
      new Error('Storage unavailable'),
    );
    const service = createPeopleService(repository, () => 'new-rate');
    await expect(
      service.saveRate('emp-001', {
        validFrom: '2027-01-01',
        hourlyCostEUR: '100',
      }),
    ).rejects.toThrow('Storage unavailable');
    expect(await repository.getRateRecord('new-rate')).toBeUndefined();
  });
});

test('add/edit/delete publish only employeeId after successful persistence', async () => {
  const repository = memoryRepository();
  const observed: unknown[] = [];
  const publish = vi.fn(({ employeeId }: { employeeId: string }) =>
    observed.push({ employeeId }),
  );
  const service = createPeopleService(
    repository,
    () => 'new-event-rate',
    publish,
  );
  const persisted = vi.spyOn(repository, 'addRateRecord');
  await service.saveRate('emp-001', {
    validFrom: '2027-01-01',
    hourlyCostEUR: '100',
  });
  expect(persisted.mock.invocationCallOrder[0]).toBeLessThan(
    publish.mock.invocationCallOrder[0]!,
  );
  const update = vi.spyOn(repository, 'updateRateRecord');
  await service.saveRate(
    'emp-001',
    { validFrom: '2027-01-01', hourlyCostEUR: '105' },
    'new-event-rate',
  );
  expect(update.mock.invocationCallOrder[0]).toBeLessThan(
    publish.mock.invocationCallOrder[1]!,
  );
  const remove = vi.spyOn(repository, 'deleteRateRecord');
  await service.deleteRate('emp-001', 'new-event-rate');
  expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
    publish.mock.invocationCallOrder[2]!,
  );
  expect(observed).toEqual([
    { employeeId: 'emp-001' },
    { employeeId: 'emp-001' },
    { employeeId: 'emp-001' },
  ]);
});
test('validation and each failed mutation path never publish', async () => {
  const repository = memoryRepository();
  const publish = vi.fn();
  const service = createPeopleService(
    repository,
    () => 'new-event-rate',
    publish,
  );
  await expect(
    service.saveRate('emp-001', {
      validFrom: '2026-03-12',
      hourlyCostEUR: '-1',
    }),
  ).rejects.toThrow();
  vi.spyOn(repository, 'addRateRecord').mockRejectedValue(
    new Error('add failed'),
  );
  vi.spyOn(repository, 'updateRateRecord').mockRejectedValue(
    new Error('edit failed'),
  );
  vi.spyOn(repository, 'deleteRateRecord').mockRejectedValue(
    new Error('delete failed'),
  );
  await expect(
    service.saveRate('emp-001', {
      validFrom: '2027-01-01',
      hourlyCostEUR: '100',
    }),
  ).rejects.toThrow('add failed');
  await expect(
    service.saveRate(
      'emp-001',
      { validFrom: '2026-03-12', hourlyCostEUR: '100' },
      'rate-002',
    ),
  ).rejects.toThrow('edit failed');
  await expect(service.deleteRate('emp-001', 'rate-002')).rejects.toThrow(
    'delete failed',
  );
  expect(publish).not.toHaveBeenCalled();
});

test('public planning capability returns fresh owner snapshots without exposing persistence', async () => {
  const repository = memoryRepository();
  const capability = createPlanningPeopleCapability(repository);
  expect(Object.keys(capability).sort()).toEqual([
    'getPlanningPerson',
    'listPlanningPeople',
  ]);
  expect(await capability.listPlanningPeople()).toHaveLength(60);
  const before = await capability.getPlanningPerson('emp-001');
  expect(before?.rates.map((rate) => rate.hourlyCostEUR)).toEqual([80, 95]);
  await repository.updateRateRecord({
    ...before!.rates[1]!,
    hourlyCostEUR: 110,
  });
  expect(
    (await capability.getPlanningPerson('emp-001'))?.rates[1]?.hourlyCostEUR,
  ).toBe(110);
  expect(before?.rates[1]?.hourlyCostEUR).toBe(95);
  expect(await capability.getPlanningPerson('missing')).toBeUndefined();
});

test('rate publication waits for persistence completion rather than request initiation', async () => {
  const repository = memoryRepository();
  let finish: (() => void) | undefined;
  vi.spyOn(repository, 'addRateRecord').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const publish = vi.fn();
  const service = createPeopleService(
    repository,
    () => 'pending-rate',
    publish,
  );
  const saving = service.saveRate('emp-001', {
    validFrom: '2027-01-01',
    hourlyCostEUR: '100',
  });
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(publish).not.toHaveBeenCalled();
  finish?.();
  await saving;
  expect(publish).toHaveBeenCalledExactlyOnceWith({ employeeId: 'emp-001' });
});
