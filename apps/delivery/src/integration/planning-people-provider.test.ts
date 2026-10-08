import { expect, test, vi } from 'vitest';
import type { PlanningPeopleCapability } from '@baseline/contracts';
import {
  createCapabilityPlanningPeopleProvider,
  createRuntimePlanningPeopleProvider,
} from './planning-people-provider';
const person = {
  employeeId: 'e',
  name: 'Employee',
  weeklyHours: 40 as const,
  rates: [
    {
      id: 'r',
      employeeId: 'e',
      validFrom: '2025-01-01' as const,
      hourlyCostEUR: 95,
    },
  ],
};

test('authority wins over bootstrap; targeted get fetches fresh rates only for the requested employee', async () => {
  const capability: PlanningPeopleCapability = {
    listPlanningPeople: vi.fn(async () => [person]),
    getPlanningPerson: vi.fn(async (id) =>
      id === 'e'
        ? { ...person, rates: [{ ...person.rates[0]!, hourlyCostEUR: 110 }] }
        : undefined,
    ),
  };
  const load = vi.fn(async () => capability);
  const provider = createCapabilityPlanningPeopleProvider(load);
  expect(await provider.listPeople()).toEqual([person]);
  expect((await provider.getPerson('e'))?.rates[0]?.hourlyCostEUR).toBe(110);
  expect(capability.getPlanningPerson).toHaveBeenCalledExactlyOnceWith('e');
  expect(capability.listPlanningPeople).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledTimes(1);
});
test('failed authority never falls back to bootstrap rates, retains schedules, and can recover', async () => {
  const capability: PlanningPeopleCapability = {
    listPlanningPeople: vi.fn(async () => [person]),
    getPlanningPerson: vi.fn(async () => person),
  };
  const provider = createCapabilityPlanningPeopleProvider(
    async () => capability,
  );
  await provider.listPeople();
  vi.mocked(capability.getPlanningPerson).mockRejectedValueOnce(
    new Error('offline'),
  );
  expect(await provider.getPerson('e')).toMatchObject({
    weeklyHours: 40,
    rates: [],
    rateDataError: expect.stringContaining('unavailable'),
  });
  expect((await provider.getPerson('e'))?.rates).toEqual(person.rates);
  const failing = createCapabilityPlanningPeopleProvider(async () => {
    throw new Error('remote unavailable');
  });
  const people = await failing.listPeople();
  expect(people).toHaveLength(60);
  expect(
    people.every((item) => item.rates.length === 0 && item.rateDataError),
  ).toBe(true);
});
test('standalone bootstrap is explicit configuration, not a failed-authority fallback', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ people: null })));
  try {
    const provider = createRuntimePlanningPeopleProvider();
    expect((await provider.listPeople())[0]?.rates.length).toBeGreaterThan(0);
    expect(provider.getStatus?.()).toContain('Standalone bootstrap');
  } finally {
    fetcher.mockRestore();
  }
});
