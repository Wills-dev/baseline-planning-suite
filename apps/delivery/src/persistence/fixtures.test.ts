import { expect, test } from 'vitest';
import rawSeed from '../../../../fixtures/baseline-seed.json';
import {
  createOfficialFixtures,
  mapOfficialSeed,
} from '../../../../fixtures/official-seed';
import {
  getWorkingDays,
  monthlyCapacityHours,
  personMonthsToHours,
} from '@baseline/domain';
import { createDeliveryFixtures, planningMonths } from './fixtures';

test('official bootstrap preserves all supplied identities, relationships, values and counts', () => {
  const mapped = createOfficialFixtures();
  expect([
    mapped.employees.length,
    mapped.rateRecords.length,
    mapped.projects.length,
    mapped.breakdownItems.length,
    mapped.allocations.length,
  ]).toEqual([60, 150, 4, 90, 720]);
  for (const collection of [
    'employees',
    'rateRecords',
    'projects',
    'breakdownItems',
    'allocations',
  ] as const) {
    expect(mapped[collection].map((record) => record.id)).toEqual(
      rawSeed[collection].map((record) => record.id),
    );
    expect(new Set(mapped[collection].map((record) => record.id)).size).toBe(
      rawSeed[collection].length,
    );
  }
  expect(mapped.employees).toEqual(rawSeed.employees);
  expect(mapped.projects).toEqual(rawSeed.projects);
  expect(mapped.employees[0]).toEqual({
    id: 'emp-001',
    name: 'Adaeze Okafor',
    role: 'Tech Lead',
    weeklyHours: 40,
  });
  expect(mapped.rateRecords).toEqual(
    rawSeed.rateRecords.map(({ hourlyCost, ...rate }) => ({
      ...rate,
      hourlyCostEUR: hourlyCost,
    })),
  );
  expect(mapped.rateRecords.slice(0, 2)).toEqual([
    {
      id: 'rate-001',
      employeeId: 'emp-001',
      validFrom: '2025-01-01',
      hourlyCostEUR: 80,
    },
    {
      id: 'rate-002',
      employeeId: 'emp-001',
      validFrom: '2026-03-12',
      hourlyCostEUR: 95,
    },
  ]);
  const people = new Map(mapped.employees.map((person) => [person.id, person]));
  const projects = new Set(mapped.projects.map((project) => project.id));
  const items = new Map(mapped.breakdownItems.map((item) => [item.id, item]));
  for (const rate of mapped.rateRecords)
    expect(people.has(rate.employeeId)).toBe(true);
  for (const [index, item] of mapped.breakdownItems.entries()) {
    expect(item.name).toBe(rawSeed.breakdownItems[index]?.name);
    expect(item.parentId ?? null).toBe(rawSeed.breakdownItems[index]?.parentId);
    expect(projects.has(item.projectId)).toBe(true);
    if (item.parentId) {
      const parent = items.get(item.parentId);
      expect(parent?.projectId).toBe(item.projectId);
      expect(parent?.type).toBe(
        item.type === 'Activity' ? 'WorkPackage' : 'Deliverable',
      );
    } else expect(item.type).toBe('Deliverable');
  }
  for (const [index, allocation] of mapped.allocations.entries()) {
    const raw = rawSeed.allocations[index]!;
    const employee = people.get(allocation.employeeId)!;
    expect(employee).toBeDefined();
    expect(allocation).toMatchObject({
      id: raw.id,
      employeeId: raw.employeeId,
      breakdownItemId: raw.breakdownItemId,
      month: raw.month,
      projectId: items.get(raw.breakdownItemId)?.projectId,
    });
    expect(allocation.hours).toBe(
      personMonthsToHours(
        raw.amount,
        monthlyCapacityHours(
          employee.weeklyHours,
          getWorkingDays(allocation.month).length,
        ),
      ),
    );
    expect(items.get(allocation.breakdownItemId)?.type).toBe('Activity');
  }
  expect(createDeliveryFixtures()).toEqual({
    projects: mapped.projects,
    breakdownItems: mapped.breakdownItems,
    allocations: mapped.allocations,
  });
  expect(planningMonths).toEqual([
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
    '2027-03',
  ]);
  // March is outside the visible horizon but is still authoritative bootstrap data.
  expect(mapped.allocations[0]).toMatchObject({
    id: 'alloc-001',
    month: '2026-03',
    hours: 88,
  });
});

test('mapper rejects broken external foreign keys and cycles', () => {
  const seed = structuredClone(rawSeed);
  seed.breakdownItems[0]!.parentId = 'wbs-004';
  expect(() => mapOfficialSeed(seed)).toThrow('Invalid seed parent');
  const invalidRate = structuredClone(rawSeed);
  invalidRate.rateRecords[0]!.employeeId = 'missing';
  expect(() => mapOfficialSeed(invalidRate)).toThrow(
    'Unknown seed rate employee',
  );
});

test('supplied overlapping projects remain represented without invented allocation rows', () => {
  const allocations = createDeliveryFixtures().allocations.filter(
    (allocation) =>
      allocation.employeeId === 'emp-003' && allocation.month === '2026-06',
  );
  expect(allocations.map((allocation) => allocation.id)).toEqual([
    'alloc-050',
    'alloc-073',
  ]);
  expect(allocations.map((allocation) => allocation.projectId)).toEqual([
    'prj-1',
    'prj-3',
  ]);
  for (const allocation of allocations)
    expect(allocation.hours).toBe(personMonthsToHours(0.59, 176));
});

test.each([NaN, Infinity, -Infinity, -1])(
  'rejects invalid external allocation amount %s',
  (amount) => {
    const seed = structuredClone(rawSeed);
    seed.allocations[0]!.amount = amount;
    expect(() => mapOfficialSeed(seed)).toThrow(
      'Seed allocation amount must be finite and non-negative',
    );
  },
);

test.each([NaN, Infinity, -Infinity, -1])(
  'rejects invalid external hourly cost %s',
  (hourlyCost) => {
    const seed = structuredClone(rawSeed);
    seed.rateRecords[0]!.hourlyCost = hourlyCost;
    expect(() => mapOfficialSeed(seed)).toThrow(
      'Seed hourlyCost must be finite and non-negative',
    );
  },
);

test('accepts zero external amounts and hourly costs without mutating supplied input', () => {
  const seed = structuredClone(rawSeed);
  seed.allocations[0]!.amount = 0;
  seed.rateRecords[0]!.hourlyCost = 0;
  const before = structuredClone(seed);
  const mapped = mapOfficialSeed(seed);
  expect(mapped.allocations[0]?.hours).toBe(0);
  expect(mapped.rateRecords[0]?.hourlyCostEUR).toBe(0);
  expect(seed).toEqual(before);
});
