import { officialSeedVersion } from '../../../../fixtures/official-seed';
import type { Allocation, BreakdownItem, Project } from '@baseline/domain';
import { createDatabase } from '@baseline/persistence';
import { createDeliveryFixtures } from './fixtures';

export interface DeliveryRepository {
  initialize(): Promise<void>;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  listBreakdownItems(projectId: string): Promise<BreakdownItem[]>;
  saveBreakdownItem(item: BreakdownItem): Promise<void>;
  deleteBreakdownItem(id: string): Promise<void>;
  listAllocations(): Promise<Allocation[]>;
  listProjectAllocations(projectId: string): Promise<Allocation[]>;
  saveAllocation(allocation: Allocation): Promise<void>;
  deleteAllocation(id: string): Promise<void>;
  close(): Promise<void>;
}

interface DeliveryStores {
  projects: Project;
  breakdownItems: BreakdownItem;
  allocations: Allocation;
}

export function createDeliveryRepository(): DeliveryRepository {
  const database = createDatabase<DeliveryStores>({
    name: 'baseline-planning-delivery',
    version: 1,
    seedVersion: officialSeedVersion,
    replaceLegacySeed: true,
    stores: [
      { name: 'projects' },
      {
        name: 'breakdownItems',
        indexes: [{ name: 'projectId', keyPath: 'projectId' }],
      },
      {
        name: 'allocations',
        indexes: [{ name: 'projectId', keyPath: 'projectId' }],
      },
    ],
    seed: createDeliveryFixtures,
  });
  return {
    initialize: database.initialize,
    listProjects: () => database.list('projects'),
    getProject: (id) => database.get('projects', id),
    listBreakdownItems: (projectId) =>
      database.listByIndex('breakdownItems', 'projectId', projectId),
    saveBreakdownItem: (item) => database.put('breakdownItems', item),
    deleteBreakdownItem: (id) => database.delete('breakdownItems', id),
    listAllocations: () => database.list('allocations'),
    listProjectAllocations: (projectId) =>
      database.listByIndex('allocations', 'projectId', projectId),
    saveAllocation: (allocation) =>
      database.putSequenced('allocations', allocation, 'editSequence'),
    deleteAllocation: (id) => database.delete('allocations', id),
    close: database.close,
  };
}
