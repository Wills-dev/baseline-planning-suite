import { expect, test } from 'vitest';
import { blendedHourlyRate, priceAllocation } from '@baseline/domain';
import { createPeopleFixtures } from './fixtures';

test('People fixtures have deterministic scale, valid schedules, and unique effective dates', () => {
  const fixtures = createPeopleFixtures();
  expect(createPeopleFixtures()).toEqual(fixtures);
  expect(fixtures.employees).toHaveLength(60);
  expect(fixtures.rateRecords).toHaveLength(150);
  const ids = new Set(fixtures.employees.map((employee) => employee.id));
  expect(ids.size).toBe(60);
  expect(
    new Set(fixtures.employees.map((employee) => employee.name)).size,
  ).toBe(60);
  expect(new Set(fixtures.rateRecords.map((rate) => rate.id)).size).toBe(150);
  expect(
    new Set(
      fixtures.rateRecords.map(
        (rate) => `${rate.employeeId}:${rate.validFrom}`,
      ),
    ).size,
  ).toBe(150);
  for (const employee of fixtures.employees)
    expect([20, 32, 40]).toContain(employee.weeklyHours);
  for (const rate of fixtures.rateRecords) {
    expect(ids.has(rate.employeeId)).toBe(true);
    expect(Number.isFinite(rate.hourlyCostEUR)).toBe(true);
    expect(rate.hourlyCostEUR).toBeGreaterThanOrEqual(0);
  }
  const midMonthChanges = fixtures.rateRecords.filter((rate) => {
    const day = Number(rate.validFrom.slice(8));
    return (
      day > 1 &&
      day < 28 &&
      fixtures.rateRecords.some(
        (earlier) =>
          earlier.employeeId === rate.employeeId &&
          earlier.validFrom < rate.validFrom,
      )
    );
  });
  expect(midMonthChanges.length).toBeGreaterThanOrEqual(10);
});

test('Adaeze Okafor fixtures preserve the reference rates and March pricing', () => {
  const fixtures = createPeopleFixtures();
  const employee = fixtures.employees.find(
    (item) => item.name === 'Adaeze Okafor',
  );
  expect(employee).toMatchObject({ id: 'emp-001', weeklyHours: 40 });
  const rates = fixtures.rateRecords.filter(
    (rate) => rate.employeeId === employee?.id,
  );
  expect(
    rates.map(({ validFrom, hourlyCostEUR }) => ({ validFrom, hourlyCostEUR })),
  ).toEqual([
    { validFrom: '2025-01-01', hourlyCostEUR: 80 },
    { validFrom: '2026-03-12', hourlyCostEUR: 95 },
  ]);
  const result = priceAllocation(
    {
      id: 'reference',
      projectId: 'reference',
      breakdownItemId: 'reference',
      employeeId: 'emp-001',
      month: '2026-03',
      hours: 88,
    },
    rates,
  );
  expect(result.totalCostEUR).toBe(7880);
  expect(blendedHourlyRate(result.totalCostEUR, 88)).toBeCloseTo(
    89.54545454545455,
    12,
  );
});

test('callers can change mapped fixtures without changing future fixture mapping', () => {
  const fixtures = createPeopleFixtures();
  const rate = fixtures.rateRecords[0];
  if (!rate) throw new Error('Missing fixture rate');
  rate.hourlyCostEUR = 1;
  expect(createPeopleFixtures().rateRecords[0]?.hourlyCostEUR).toBe(80);
});
