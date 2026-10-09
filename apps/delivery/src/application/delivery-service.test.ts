import { capacityKey } from '@baseline/domain';
import type { PlanningPeopleProvider, PlanningPerson } from './planning-people';
import { describe, expect, test, vi } from 'vitest';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import { createDeliveryFixtures } from '../persistence/fixtures';
import { createDeliveryService } from './delivery-service';
import { createFixturePlanningPeopleProvider } from './planning-people';
import {
  allocationIdentity,
  priceCellHours,
  hoursToDisplay,
  inputToHours,
} from './allocation-values';
import { createLatestProjectRequest } from './latest-project-request';

function memoryRepository(): DeliveryRepository {
  const fixtures = createDeliveryFixtures();
  const items = new Map(fixtures.breakdownItems.map((item) => [item.id, item]));
  const allocations = new Map(
    fixtures.allocations.map((allocation) => [allocation.id, allocation]),
  );
  return {
    initialize: async () => undefined,
    listProjects: async () => fixtures.projects,
    getProject: async (id) =>
      fixtures.projects.find((project) => project.id === id),
    listBreakdownItems: async (projectId) =>
      [...items.values()].filter((item) => item.projectId === projectId),
    saveBreakdownItem: async (item) => {
      items.set(item.id, item);
    },
    deleteBreakdownItem: async (id) => {
      items.delete(id);
    },
    listAllocations: async () => [...allocations.values()],
    listProjectAllocations: async (projectId) =>
      [...allocations.values()].filter(
        (allocation) => allocation.projectId === projectId,
      ),
    saveAllocation: async (allocation) => {
      const editSequence =
        Math.max(
          0,
          ...[...allocations.values()].map((item) => item.editSequence ?? 0),
        ) + 1;
      allocations.set(allocation.id, { ...allocation, editSequence });
    },
    deleteAllocation: async (id) => {
      allocations.delete(id);
    },
    close: async () => undefined,
  };
}
const provider = createFixturePlanningPeopleProvider();
const projectId = 'prj-1';
const leafId = 'wbs-012';

function setup() {
  const repository = memoryRepository();
  let nextId = 0;
  return {
    repository,
    service: createDeliveryService(repository, provider, () =>
      nextId++ === 0 ? 'new-work-item' : `new-work-item-${nextId}`,
    ),
  };
}

test('explicit bootstrap read model matches 60 stable fixture identities and rate histories', async () => {
  const people = await provider.listPeople();
  expect(people).toHaveLength(60);
  expect(people[0]).toEqual({
    employeeId: 'emp-001',
    name: 'Adaeze Okafor',
    weeklyHours: 40,
    rates: expect.any(Array),
  });
  expect(await provider.listPeople()).toEqual(people);
  for (const person of people)
    expect(Object.keys(person).sort()).toEqual([
      'employeeId',
      'name',
      'rates',
      'weeklyHours',
    ]);
});

test('reference PM/Hours/Percent conversions preserve canonical values', async () => {
  const person = (await provider.listPeople())[0]!;
  expect(inputToHours('0.5', 'PM', person, '2026-03')).toBe(88);
  expect(hoursToDisplay(88, 'Percent', person, '2026-03')).toBe(50);
  expect(hoursToDisplay(88, 'Hours', person, '2026-03')).toBe(88);
  const original = 13.123456789;
  const pm = hoursToDisplay(original, 'PM', person, '2026-03');
  expect(inputToHours(String(pm), 'PM', person, '2026-03')).toBeCloseTo(
    original,
    12,
  );
});

test.each(['', ' ', '-1', 'NaN', 'Infinity', 'nope'])(
  'rejects invalid allocation input %s',
  async (input) => {
    const person = (await provider.listPeople())[0]!;
    expect(() => inputToHours(input, 'Hours', person, '2026-03')).toThrow();
  },
);

describe('repository-backed Delivery operations', () => {
  test('loads four projects and project-specific WBS/allocations', async () => {
    const { service } = setup();
    expect((await service.initialize()).projects).toHaveLength(4);
    const atlas = await service.loadProject(projectId);
    const beacon = await service.loadProject('prj-2');
    expect(atlas.items.every((item) => item.projectId === projectId)).toBe(
      true,
    );
    expect(
      beacon.allocations.every(
        (allocation) => allocation.projectId === 'prj-2',
      ),
    ).toBe(true);
  });

  test('edits a seeded cell in-place without new IDs and deletes it on zero', async () => {
    const { repository, service } = setup();
    const original = (await repository.listProjectAllocations(projectId)).find(
      (allocation) =>
        allocation.breakdownItemId === leafId &&
        allocation.employeeId === 'emp-016' &&
        allocation.month === '2026-04',
    )!;
    await service.saveCell(
      projectId,
      leafId,
      'emp-016',
      '2026-04',
      '0.2',
      'PM',
    );
    await service.saveCell(
      projectId,
      leafId,
      'emp-016',
      '2026-04',
      '20',
      'Percent',
    );
    const records = (await repository.listProjectAllocations(projectId)).filter(
      (allocation) =>
        allocation.breakdownItemId === leafId &&
        allocation.employeeId === 'emp-016' &&
        allocation.month === '2026-04',
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(original.id);
    expect(records[0]?.hours).toBeCloseTo(28.16, 12);
    await service.saveCell(
      projectId,
      leafId,
      'emp-016',
      '2026-04',
      '0',
      'Hours',
    );
    expect(
      (await repository.listProjectAllocations(projectId)).some(
        (allocation) => allocation.id === original.id,
      ),
    ).toBe(false);
  });

  test('new logical cells use deterministic IDs and repeated concurrent upserts do not duplicate them', async () => {
    const { repository, service } = setup();
    await Promise.all([
      service.saveCell(
        projectId,
        leafId,
        'emp-060',
        '2026-04',
        '10.123456',
        'Hours',
      ),
      service.saveCell(
        projectId,
        leafId,
        'emp-060',
        '2026-04',
        '11.123456',
        'Hours',
      ),
    ]);
    const records = (await repository.listProjectAllocations(projectId)).filter(
      (allocation) =>
        allocation.employeeId === 'emp-060' &&
        allocation.breakdownItemId === leafId &&
        allocation.month === '2026-04',
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(
      allocationIdentity(projectId, leafId, 'emp-060', '2026-04'),
    );
    expect(records[0]?.hours).toBe(11.123456);
  });

  test('rejects parent allocations and duplicate logical records instead of silently consolidating', async () => {
    const { repository, service } = setup();
    await expect(
      service.saveCell(
        projectId,
        'wbs-001',
        'emp-016',
        '2026-04',
        '10',
        'Hours',
      ),
    ).rejects.toThrow('leaf work item');
    await repository.saveAllocation({
      id: 'duplicate',
      projectId,
      breakdownItemId: leafId,
      employeeId: 'emp-016',
      month: '2026-04',
      hours: 10,
    });
    await expect(
      service.saveCell(projectId, leafId, 'emp-016', '2026-04', '10', 'Hours'),
    ).rejects.toThrow('duplicate allocation');
  });

  test('creates, renames, moves and safely deletes work items', async () => {
    const { repository, service } = setup();
    await service.saveWorkItem(projectId, {
      name: 'New Activity',
      type: 'Activity',
      parentId: 'wbs-004',
    });
    await service.saveWorkItem(
      projectId,
      {
        name: 'Renamed Activity',
        type: 'Activity',
        parentId: 'wbs-005',
      },
      'new-work-item',
    );
    expect(
      (await repository.listBreakdownItems(projectId)).find(
        (item) => item.id === 'new-work-item',
      ),
    ).toMatchObject({
      name: 'Renamed Activity',
      parentId: 'wbs-005',
    });
    await expect(service.deleteWorkItem(projectId, 'wbs-001')).rejects.toThrow(
      'children',
    );
    await expect(service.deleteWorkItem(projectId, leafId)).rejects.toThrow(
      'allocated item',
    );
    await service.deleteWorkItem(projectId, 'new-work-item');
    expect(
      (await repository.listBreakdownItems(projectId)).some(
        (item) => item.id === 'new-work-item',
      ),
    ).toBe(false);
  });

  test('refuses to add children beneath a newly allocated root leaf', async () => {
    const { repository, service } = setup();
    await service.saveWorkItem(projectId, {
      name: 'Allocated root',
      type: 'Deliverable',
    });
    await service.saveCell(
      projectId,
      'new-work-item',
      'emp-001',
      '2026-04',
      '10',
      'Hours',
    );
    await expect(
      service.saveWorkItem(projectId, {
        name: 'Cannot add',
        type: 'WorkPackage',
        parentId: 'new-work-item',
      }),
    ).rejects.toThrow('allocated work item');
    expect(
      (await repository.listProjectAllocations(projectId)).find(
        (allocation) => allocation.breakdownItemId === 'new-work-item',
      )?.hours,
    ).toBe(10);
  });
});

test('stale project reads and mutation responses are discarded after a project switch or unmount', async () => {
  const requests = createLatestProjectRequest();
  const old = requests.next();
  let completeOld: ((project: string) => void) | undefined;
  const response = new Promise<string>((resolve) => {
    completeOld = resolve;
  });
  let visibleProject = '';
  const oldResponse = response.then((project) => {
    if (requests.isCurrent(old)) visibleProject = project;
  });
  const current = requests.next();
  if (requests.isCurrent(current)) visibleProject = 'beacon';
  completeOld?.('atlas');
  await oldResponse;
  expect(visibleProject).toBe('beacon');
  requests.cancel();
  expect(requests.isCurrent(current)).toBe(false);
});

test.each(['-1', 'NaN', 'Infinity', '', 'invalid'])(
  'invalid cell value %s leaves persistence untouched',
  async (input) => {
    const { repository, service } = setup();
    const before = await repository.listAllocations();
    const save = vi.spyOn(repository, 'saveAllocation');
    const remove = vi.spyOn(repository, 'deleteAllocation');
    await expect(
      service.saveCell(projectId, leafId, 'emp-016', '2026-04', input, 'Hours'),
    ).rejects.toThrow('finite, non-negative');
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(await repository.listAllocations()).toEqual(before);
  },
);

test('rejects months outside the official horizon and overflowing PM conversions without writes', async () => {
  const { repository, service } = setup();
  const save = vi.spyOn(repository, 'saveAllocation');
  await expect(
    service.saveCell(projectId, leafId, 'emp-016', '2026-03', '10', 'Hours'),
  ).rejects.toThrow('2026-04–2027-03');
  await expect(
    service.saveCell(projectId, leafId, 'emp-016', '2026-04', '1e308', 'PM'),
  ).rejects.toThrow('converted allocation hours');
  expect(save).not.toHaveBeenCalled();
});

test('renaming and moving an allocated official activity preserves its identity and every allocation', async () => {
  const { repository, service } = setup();
  const allocationsBefore = await repository.listAllocations();
  await service.saveWorkItem(
    projectId,
    { name: 'Renamed design', type: 'Activity', parentId: 'wbs-005' },
    leafId,
  );
  expect(
    (await repository.listBreakdownItems(projectId)).find(
      (item) => item.id === leafId,
    ),
  ).toMatchObject({ id: leafId, name: 'Renamed design', parentId: 'wbs-005' });
  expect(await repository.listAllocations()).toEqual(allocationsBefore);
});

test('invalid WBS mutation never calls persistence', async () => {
  const { repository, service } = setup();
  const save = vi.spyOn(repository, 'saveBreakdownItem');
  await expect(
    service.saveWorkItem(
      projectId,
      { name: 'Invalid move', type: 'Activity', parentId: 'wbs-001' },
      leafId,
    ),
  ).rejects.toThrow('WorkPackage parent');
  await expect(
    service.saveWorkItem(projectId, { name: '  ', type: 'Deliverable' }),
  ).rejects.toThrow('work item name');
  expect(save).not.toHaveBeenCalled();
});

test('initialization exposes the bootstrap horizon as application configuration', async () => {
  const { service } = setup();
  const { planningMonths } = await service.initialize();
  expect(planningMonths).toHaveLength(12);
  expect(planningMonths[0]).toBe('2026-04');
  expect(planningMonths.at(-1)).toBe('2027-03');
});

test('official March integration and Cost input use the same effective-dated model', async () => {
  const { repository, service } = setup();
  const person = (await service.initialize()).people[0]!;
  const march = (await repository.listAllocations()).find(
    (allocation) => allocation.id === 'alloc-001',
  )!;
  expect(march.hours).toBe(88);
  expect(hoursToDisplay(march.hours, 'PM', person, march.month)).toBe(0.5);
  expect(hoursToDisplay(march.hours, 'Percent', person, march.month)).toBe(50);
  expect(hoursToDisplay(march.hours, 'Cost', person, march.month)).toBe(7880);
  expect(inputToHours('7880', 'Cost', person, march.month)).toBeCloseTo(88, 12);
  // Visible horizon remains supplied April–March; use a visible split-rate month to save Cost.
  const jonas = (await provider.getPerson('emp-007'))!;
  const hours = 13.123456789;
  const cost = hoursToDisplay(hours, 'Cost', jonas, '2026-05');
  const data = await service.saveCell(
    projectId,
    leafId,
    jonas.employeeId,
    '2026-05',
    String(cost),
    'Cost',
  );
  const stored = data.allocations.find(
    (allocation) =>
      allocation.employeeId === jonas.employeeId &&
      allocation.breakdownItemId === leafId &&
      allocation.month === '2026-05',
  )!;
  expect(stored.hours).toBeCloseTo(hours, 12);
  expect(Object.keys(stored).sort()).toEqual([
    'breakdownItemId',
    'editSequence',
    'employeeId',
    'hours',
    'id',
    'month',
    'projectId',
  ]);
});

test('targeted authoritative refresh changes cost without changing persisted hours or global capacity', async () => {
  const repository = memoryRepository();
  const snapshots = await provider.listPeople();
  let current = snapshots.find((person) => person.employeeId === 'emp-003')!;
  const authoritative: PlanningPeopleProvider = {
    listPeople: vi.fn(async () => snapshots),
    getPerson: vi.fn(async (id) =>
      id === current.employeeId ? current : undefined,
    ),
  };
  const service = createDeliveryService(repository, authoritative);
  const before = await service.loadProject('prj-1');
  const original = await repository.listAllocations();
  const key = capacityKey('emp-003', '2026-06');
  expect(before.capacityStatuses.get(key)?.utilizationPercent).toBe(118);
  expect(before.latestCapacityEdits.size).toBe(0);
  const oldCost = hoursToDisplay(88, 'Cost', current, '2026-06');
  current = {
    ...current,
    rates: current.rates.map((rate) => ({
      ...rate,
      hourlyCostEUR: rate.hourlyCostEUR * 2,
    })),
  };
  const refreshed = await service.refreshPerson('emp-003');
  expect(authoritative.getPerson).toHaveBeenCalledExactlyOnceWith('emp-003');
  expect(authoritative.listPeople).toHaveBeenCalledTimes(1);
  expect(
    hoursToDisplay(
      88,
      'Cost',
      refreshed.find((person) => person.employeeId === 'emp-003')!,
      '2026-06',
    ),
  ).toBeCloseTo(oldCost * 2, 10);
  const after = await service.loadProject('prj-3');
  expect(after.capacityStatuses.get(key)).toEqual(
    before.capacityStatuses.get(key),
  );
  expect(await repository.listAllocations()).toEqual(original);
});

test('missing rates reject Cost writes but preserve PM/Hours/Percent editing', async () => {
  const repository = memoryRepository();
  const person = { ...(await provider.getPerson('emp-016'))!, rates: [] };
  const service = createDeliveryService(repository, {
    listPeople: async () => [person],
    getPerson: async () => person,
  });
  const save = vi.spyOn(repository, 'saveAllocation');
  expect(priceCellHours(88, person, '2026-04')).toMatchObject({
    costEUR: null,
    editable: false,
    unavailable: 'Cost unavailable: no applicable rate.',
  });
  await expect(
    service.saveCell(
      projectId,
      leafId,
      person.employeeId,
      '2026-04',
      '100',
      'Cost',
    ),
  ).rejects.toThrow('no applicable rate');
  expect(save).not.toHaveBeenCalled();
  for (const unit of ['Hours', 'PM', 'Percent'] as const)
    await expect(
      service.saveCell(
        projectId,
        leafId,
        person.employeeId,
        '2026-04',
        '1',
        unit,
      ),
    ).resolves.toBeDefined();
});

test('refresh failure clears stale prices; older targeted responses cannot replace newer authority', async () => {
  const repository = memoryRepository();
  const person = (await provider.getPerson('emp-001'))!;
  const get = vi.fn(async () => person);
  const service = createDeliveryService(repository, {
    listPeople: async () => [person],
    getPerson: get,
  });
  await service.initialize();
  get.mockRejectedValueOnce(new Error('offline'));
  expect((await service.refreshPerson(person.employeeId))[0]).toMatchObject({
    rates: [],
    rateDataError: expect.stringContaining('unavailable'),
  });
  let resolveOlder: ((person: PlanningPerson) => void) | undefined;
  get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOlder = resolve;
      }),
  );
  const older = service.refreshPerson(person.employeeId);
  await Promise.resolve();
  await Promise.resolve();
  const newer = {
    ...person,
    rates: person.rates.map((rate) => ({ ...rate, hourlyCostEUR: 200 })),
  };
  get.mockResolvedValueOnce(newer);
  await service.refreshPerson(person.employeeId);
  resolveOlder?.(person);
  await older;
  expect(service.currentPeople()[0]?.rates[0]?.hourlyCostEUR).toBe(200);
});

test('save over capacity warns and subsequent reduction/deletion clears resolved attribution', async () => {
  const { service } = setup();
  const key = capacityKey('emp-003', '2026-06');
  let data = await service.saveCell(
    projectId,
    leafId,
    'emp-003',
    '2026-06',
    '176',
    'Hours',
  );
  expect(data.capacityStatuses.get(key)?.overAllocated).toBe(true);
  expect(data.latestCapacityEdits.get(key)).toMatchObject({
    projectId,
    breakdownItemId: leafId,
  });
  data = await service.saveCell(
    projectId,
    leafId,
    'emp-003',
    '2026-06',
    '1',
    'Hours',
  );
  expect(data.capacityStatuses.get(key)?.overAllocated).toBe(false);
  expect(data.latestCapacityEdits.has(key)).toBe(false);
  data = await service.saveCell(
    projectId,
    leafId,
    'emp-003',
    '2026-06',
    '0',
    'Hours',
  );
  expect(data.capacityStatuses.get(key)?.overAllocated).toBe(false);
});

test('a rate invalidation during slow initialization is retained in the returned snapshot', async () => {
  const repository = memoryRepository();
  let finish:
    | ((
        projects: Awaited<ReturnType<DeliveryRepository['listProjects']>>,
      ) => void)
    | undefined;
  const projects = await repository.listProjects();
  vi.spyOn(repository, 'listProjects').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const person = (await provider.getPerson('emp-001'))!;
  const newer = {
    ...person,
    rates: person.rates.map((rate) => ({ ...rate, hourlyCostEUR: 110 })),
  };
  const service = createDeliveryService(repository, {
    listPeople: async () => [person],
    getPerson: async () => newer,
  });
  const initializing = service.initialize();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await service.refreshPerson(person.employeeId);
  finish?.(projects);
  expect((await initializing).people[0]?.rates[0]?.hourlyCostEUR).toBe(110);
});

test('latest contributing assignment survives service reload and uses the other project name; deletion falls back', async () => {
  const { repository, service } = setup();
  const key = capacityKey('emp-003', '2026-06');
  await service.saveCell(
    'prj-1',
    'wbs-012',
    'emp-003',
    '2026-06',
    '200',
    'Hours',
  );
  await service.saveCell(
    'prj-3',
    'wbs-061',
    'emp-003',
    '2026-06',
    '300',
    'Hours',
  );
  const reloaded = createDeliveryService(repository, provider);
  const data = await reloaded.loadProject('prj-1');
  expect(data.capacityStatuses.get(key)?.overAllocated).toBe(true);
  expect(data.latestCapacityEdits.get(key)).toMatchObject({
    projectId: 'prj-3',
    breakdownItemId: 'wbs-061',
    assignmentName: 'Client Portal Rebuild / Implementation',
  });
  const deleted = await reloaded.saveCell(
    'prj-3',
    'wbs-061',
    'emp-003',
    '2026-06',
    '0',
    'Hours',
  );
  expect(deleted.latestCapacityEdits.get(key)?.projectId).toBe('prj-1');
});
