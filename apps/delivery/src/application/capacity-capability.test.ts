import { expect, test, vi } from 'vitest';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import { createDeliveryCapacityCapability } from './capacity-capability';

test('published capability reads every project without opening one, includes out-of-horizon months, and distinguishes 100% from excess', async () => {
  const allocations = [
    {
      id: 'a',
      projectId: 'closed',
      breakdownItemId: 'x',
      employeeId: 'e',
      month: '2026-03' as const,
      hours: 88,
    },
    {
      id: 'b',
      projectId: 'other',
      breakdownItemId: 'y',
      employeeId: 'e',
      month: '2026-03' as const,
      hours: 88,
    },
  ];
  const initialize = vi.fn(async () => undefined);
  const repository = {
    initialize,
    listAllocations: vi.fn(async () => allocations),
  } as unknown as DeliveryRepository;
  const capability = createDeliveryCapacityCapability(repository);
  const people = [{ employeeId: 'e', weeklyHours: 40 as const }];
  expect(await capability.listCapacityStatuses(people)).toEqual([
    { employeeId: 'e', oversubscribedMonths: [] },
  ]);
  allocations[1]!.hours += 0.001;
  expect(await capability.listCapacityStatuses(people)).toEqual([
    { employeeId: 'e', oversubscribedMonths: ['2026-03'] },
  ]);
  expect(initialize).toHaveBeenCalledTimes(2);
  repository.listAllocations = async () => {
    throw new Error('storage offline');
  };
  await expect(capability.listCapacityStatuses(people)).rejects.toThrow(
    'storage offline',
  );
});
