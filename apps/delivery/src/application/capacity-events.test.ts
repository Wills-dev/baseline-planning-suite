// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { subscribeDeliveryAllocationsChanged } from '@baseline/contracts';
import type { Allocation } from '@baseline/domain';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import { createDeliveryService } from './delivery-service';

test('allocation invalidation is published only after persistence; failed writes do not invalidate and deletion does', async () => {
  let records: Allocation[] = [];
  let complete: (() => void) | undefined;
  const repository: DeliveryRepository = {
    initialize: async () => undefined,
    listProjects: async () => [{ id: 'p', name: 'Project' }],
    getProject: async () => ({ id: 'p', name: 'Project' }),
    listBreakdownItems: async () => [
      { id: 'leaf', name: 'Work', type: 'Deliverable', projectId: 'p' },
    ],
    listAllocations: async () => records,
    listProjectAllocations: async () => records,
    saveAllocation: vi.fn(async (record) => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      records = [{ ...record, editSequence: 1 }];
    }),
    deleteAllocation: async () => {
      records = [];
    },
    saveBreakdownItem: async () => undefined,
    deleteBreakdownItem: async () => undefined,
    close: async () => undefined,
  };
  const person = {
    employeeId: 'e',
    name: 'Person',
    weeklyHours: 40 as const,
    rates: [],
  };
  const service = createDeliveryService(repository, {
    listPeople: async () => [person],
    getPerson: async () => person,
  });
  const listener = vi.fn();
  const unsubscribe = subscribeDeliveryAllocationsChanged(listener);
  try {
    const saving = service.saveCell(
      'p',
      'leaf',
      'e',
      '2026-06',
      '200',
      'Hours',
    );
    await vi.waitFor(() => expect(complete).toBeDefined());
    expect(listener).not.toHaveBeenCalled();
    complete!();
    const data = await saving;
    expect(data.capacityStatuses.values().next().value).toBeDefined();
    expect(data.allocations[0]!.hours).toBe(200);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
    vi.mocked(repository.saveAllocation).mockRejectedValueOnce(
      new Error('write failed'),
    );
    await expect(
      service.saveCell('p', 'leaf', 'e', '2026-06', '300', 'Hours'),
    ).rejects.toThrow('write failed');
    expect(listener).toHaveBeenCalledTimes(1);
    await service.saveCell('p', 'leaf', 'e', '2026-06', '0', 'Hours');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(records).toEqual([]);
  } finally {
    unsubscribe();
  }
});
