import type {
  Allocation,
  BreakdownItem,
  BreakdownItemType,
  YearMonth,
} from '@baseline/domain';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import type { PlanningPeopleProvider, PlanningPerson } from './planning-people';
import { bootstrapPlanningConfiguration } from './planning-config';
import type { PlanningConfiguration } from './planning-config';
import { assertCanDelete, buildWbsTree, isLeaf, validateWbsItem } from './wbs';
import { allocationIdentity, inputToHours } from './allocation-values';
import type { EditableUnit } from './allocation-values';
import { PlanningInputError } from './planning-error';

export interface ProjectPlanningData {
  projectId: string;
  items: BreakdownItem[];
  allocations: Allocation[];
}

export interface WorkItemInput {
  name: string;
  type: BreakdownItemType;
  parentId?: string;
}

export function createDeliveryService(
  repository: DeliveryRepository,
  peopleProvider: PlanningPeopleProvider,
  createId: () => string = () => crypto.randomUUID(),
  configuration: PlanningConfiguration = bootstrapPlanningConfiguration,
) {
  const { planningMonths } = configuration;
  async function loadProject(projectId: string): Promise<ProjectPlanningData> {
    if (!(await repository.getProject(projectId)))
      throw new PlanningInputError('The selected project no longer exists.');
    const [items, allocations] = await Promise.all([
      repository.listBreakdownItems(projectId),
      repository.listProjectAllocations(projectId),
    ]);
    buildWbsTree(items);
    if (
      allocations.some(
        (allocation) =>
          !Number.isFinite(allocation.hours) || allocation.hours < 0,
      )
    )
      throw new PlanningInputError(
        'This project contains invalid allocation hours. Correct the stored record before planning.',
      );
    return { projectId, items, allocations };
  }
  return {
    initialize: async () => {
      await repository.initialize();
      const [projects, people] = await Promise.all([
        repository.listProjects(),
        peopleProvider.listPeople(),
      ]);
      return { projects, people, planningMonths };
    },
    loadProject,
    saveWorkItem: async (
      projectId: string,
      input: WorkItemInput,
      id?: string,
    ) => {
      const data = await loadProject(projectId);
      if (id && !data.items.some((item) => item.id === id))
        throw new PlanningInputError(
          'This work item no longer exists. Reload the project.',
        );
      const item: BreakdownItem = {
        id: id ?? createId(),
        projectId,
        type: input.type,
        name: input.name.trim(),
        ...(input.parentId ? { parentId: input.parentId } : {}),
      };
      validateWbsItem(item, data.items, data.allocations);
      await repository.saveBreakdownItem(item);
      return loadProject(projectId);
    },
    deleteWorkItem: async (projectId: string, id: string) => {
      const data = await loadProject(projectId);
      assertCanDelete(id, data.items, data.allocations);
      await repository.deleteBreakdownItem(id);
      return loadProject(projectId);
    },
    saveCell: async (
      projectId: string,
      leafId: string,
      employeeId: string,
      month: YearMonth,
      input: string,
      unit: EditableUnit,
    ) => {
      const data = await loadProject(projectId);
      if (!isLeaf(leafId, data.items))
        throw new PlanningInputError(
          'Select a leaf work item to edit allocations. Parent totals are read-only.',
        );
      const people: PlanningPerson[] = await peopleProvider.listPeople();
      const person = people.find(
        (candidate) => candidate.employeeId === employeeId,
      );
      if (!person)
        throw new PlanningInputError(
          'This person is not available in the planning read model.',
        );
      if (!planningMonths.includes(month))
        throw new PlanningInputError(
          `Choose a month in the ${planningMonths[0]}–${planningMonths.at(-1)} planning horizon.`,
        );
      const hours = inputToHours(input, unit, person, month);
      const existing = data.allocations.filter(
        (allocation) =>
          allocation.breakdownItemId === leafId &&
          allocation.employeeId === employeeId &&
          allocation.month === month,
      );
      if (existing.length > 1)
        throw new PlanningInputError(
          'This cell has duplicate allocation records. Resolve them before editing.',
        );
      const record = existing[0];
      if (hours === 0) {
        if (record) await repository.deleteAllocation(record.id);
      } else {
        await repository.saveAllocation({
          id:
            record?.id ??
            allocationIdentity(projectId, leafId, employeeId, month),
          projectId,
          breakdownItemId: leafId,
          employeeId,
          month,
          hours,
        });
      }
      return loadProject(projectId);
    },
  };
}
