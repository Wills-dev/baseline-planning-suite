import { calculateCapacityStatuses, capacityKey } from '@baseline/domain';
import type {
  Allocation,
  CapacityStatus,
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
  people: PlanningPerson[];
  peopleStatus: string;
  capacityStatuses: ReadonlyMap<string, CapacityStatus>;
  latestCapacityEdits: ReadonlyMap<
    string,
    { projectId: string; breakdownItemId: string }
  >;
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
  const latestCapacityEdits = new Map<
    string,
    { projectId: string; breakdownItemId: string }
  >();
  let people: PlanningPerson[] | undefined;
  let capacityAllocations: readonly Allocation[] = [];
  function currentPeople(): PlanningPerson[] {
    return [...(people ?? [])];
  }
  let peopleRequest: Promise<PlanningPerson[]> | undefined;
  const refreshVersions = new Map<string, number>();
  async function readPeople(): Promise<PlanningPerson[]> {
    if (people) return people;
    peopleRequest ??= peopleProvider
      .listPeople()
      .then((result) => {
        people = result;
        return result;
      })
      .finally(() => {
        peopleRequest = undefined;
      });
    return peopleRequest;
  }
  async function refreshPerson(employeeId: string): Promise<PlanningPerson[]> {
    await readPeople();
    const version = (refreshVersions.get(employeeId) ?? 0) + 1;
    refreshVersions.set(employeeId, version);
    let person: PlanningPerson | undefined;
    try {
      person = await peopleProvider.getPerson(employeeId);
    } catch {
      const previous = people!.find((item) => item.employeeId === employeeId);
      person = previous
        ? {
            ...previous,
            rates: [],
            rateDataError: 'People rate data unavailable. Retry People data.',
          }
        : undefined;
    }
    if (refreshVersions.get(employeeId) === version) {
      people = people!.filter((item) => item.employeeId !== employeeId);
      if (person) people.push(person);
      people.sort((left, right) =>
        left.employeeId.localeCompare(right.employeeId),
      );
    }
    return [...people!];
  }
  async function loadProject(projectId: string): Promise<ProjectPlanningData> {
    if (!(await repository.getProject(projectId)))
      throw new PlanningInputError('The selected project no longer exists.');
    const [items, allAllocations] = await Promise.all([
      repository.listBreakdownItems(projectId),
      repository.listAllocations(),
      readPeople(),
    ]);
    const snapshots = people ?? [];
    capacityAllocations = allAllocations;
    const allocations = allAllocations.filter(
      (allocation) => allocation.projectId === projectId,
    );
    buildWbsTree(items);
    if (
      allAllocations.some(
        (allocation) =>
          !Number.isFinite(allocation.hours) || allocation.hours < 0,
      )
    )
      throw new PlanningInputError(
        'Delivery contains invalid allocation hours. Correct the stored record before planning.',
      );
    const capacityStatuses = calculateCapacityStatuses(
      snapshots,
      planningMonths,
      allAllocations,
    );
    for (const key of latestCapacityEdits.keys())
      if (!capacityStatuses.get(key)?.overAllocated)
        latestCapacityEdits.delete(key);
    return {
      projectId,
      items,
      allocations,
      people: snapshots,
      peopleStatus: peopleProvider.getStatus?.() ?? 'Planning people provider.',
      capacityStatuses,
      latestCapacityEdits: new Map(latestCapacityEdits),
    };
  }
  return {
    initialize: async () => {
      await repository.initialize();
      people = undefined;
      const [projects] = await Promise.all([
        repository.listProjects(),
        readPeople(),
      ]);
      return {
        projects,
        people: currentPeople(),
        planningMonths,
        peopleStatus:
          peopleProvider.getStatus?.() ?? 'Planning people provider.',
      };
    },
    loadProject,
    refreshPerson,
    currentPeople,
    peopleStatus: () =>
      peopleProvider.getStatus?.() ?? 'Planning people provider.',
    currentCapacityStatuses: () =>
      calculateCapacityStatuses(
        people ?? [],
        planningMonths,
        capacityAllocations,
      ),
    retryPeople: async () => {
      people = undefined;
      return readPeople();
    },
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
      const people: PlanningPerson[] =
        unit === 'Cost' ? await refreshPerson(employeeId) : await readPeople();
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
      const key = capacityKey(employeeId, month);
      if (hours > 0)
        latestCapacityEdits.set(key, { projectId, breakdownItemId: leafId });
      else latestCapacityEdits.delete(key);
      return loadProject(projectId);
    },
  };
}
