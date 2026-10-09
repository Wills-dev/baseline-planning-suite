import rawSeed from './baseline-seed.json';
import type {
  Allocation,
  BreakdownItem,
  DateOnly,
  Employee,
  Project,
  RateRecord,
  YearMonth,
} from '@baseline/domain';
import {
  getWorkingDays,
  monthlyCapacityHours,
  parseDateOnly,
  personMonthsToHours,
} from '@baseline/domain';

/** External bootstrap schema; repositories and UI consume only mapped domain values. */
export interface RawBaselineSeed {
  meta: { version: string; gridHorizon: { from: string; to: string } };
  employees: { id: string; name: string; role: string; weeklyHours: number }[];
  rateRecords: {
    id: string;
    employeeId: string;
    validFrom: string;
    hourlyCost: number;
  }[];
  projects: { id: string; name: string; startDate: string; endDate: string }[];
  breakdownItems: {
    id: string;
    projectId: string;
    parentId: string | null;
    name: string;
  }[];
  allocations: {
    id: string;
    breakdownItemId: string;
    employeeId: string;
    month: string;
    amount: number;
  }[];
}

function month(value: string): YearMonth {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('Invalid seed month');
  parseDateOnly(`${value}-01`);
  return value as YearMonth;
}
function date(value: string): DateOnly {
  parseDateOnly(value);
  return value as DateOnly;
}
function nonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Seed ${field} must be finite and non-negative`);
}
/** People bootstrap validates only People-owned collections. */
export function mapPeopleSeed(
  seed: Pick<RawBaselineSeed, 'employees' | 'rateRecords'>,
) {
  const employees: Employee[] = seed.employees.map((employee) => {
    const weeklyHours = employee.weeklyHours;
    if (weeklyHours !== 20 && weeklyHours !== 32 && weeklyHours !== 40)
      throw new Error('Unsupported seed schedule');
    return { ...employee, weeklyHours };
  });
  const people = new Map(employees.map((employee) => [employee.id, employee]));
  const rateRecords: RateRecord[] = seed.rateRecords.map((rate) => {
    nonNegativeFinite(rate.hourlyCost, 'hourlyCost');
    if (!people.has(rate.employeeId))
      throw new Error('Unknown seed rate employee');
    return {
      id: rate.id,
      employeeId: rate.employeeId,
      validFrom: date(rate.validFrom),
      hourlyCostEUR: rate.hourlyCost,
    };
  });
  return { employees, rateRecords };
}

/** Delivery needs only employee IDs/schedules to convert bootstrap PM into hours. */
export function mapDeliverySeed(
  seed: Pick<RawBaselineSeed, 'projects' | 'breakdownItems' | 'allocations'> & {
    employees: readonly Pick<
      RawBaselineSeed['employees'][number],
      'id' | 'weeklyHours'
    >[];
  },
) {
  const people = new Map(
    seed.employees.map(({ id, weeklyHours }) => {
      if (weeklyHours !== 20 && weeklyHours !== 32 && weeklyHours !== 40)
        throw new Error('Unsupported seed schedule');
      return [id, { id, weeklyHours }] as const;
    }),
  );
  const projects: Project[] = seed.projects.map((project) => ({
    ...project,
    startDate: date(project.startDate),
    endDate: date(project.endDate),
  }));
  const projectIds = new Set(projects.map((project) => project.id));
  const items = new Map(seed.breakdownItems.map((item) => [item.id, item]));
  const breakdownItems: BreakdownItem[] = seed.breakdownItems.map((item) => {
    if (!projectIds.has(item.projectId))
      throw new Error('Unknown seed project');
    let depth = 0;
    let cursor = item;
    const visited = new Set([item.id]);
    while (cursor.parentId !== null) {
      const parent = items.get(cursor.parentId);
      if (
        !parent ||
        parent.projectId !== item.projectId ||
        visited.has(parent.id)
      )
        throw new Error('Invalid seed parent');
      visited.add(parent.id);
      cursor = parent;
      depth++;
    }
    const type = (['Deliverable', 'WorkPackage', 'Activity'] as const)[depth];
    if (!type) throw new Error('Unsupported seed WBS depth');
    return {
      id: item.id,
      projectId: item.projectId,
      name: item.name,
      type,
      ...(item.parentId === null ? {} : { parentId: item.parentId }),
    };
  });
  const allocations: Allocation[] = seed.allocations.map((allocation) => {
    nonNegativeFinite(allocation.amount, 'allocation amount');
    const employee = people.get(allocation.employeeId);
    const item = items.get(allocation.breakdownItemId);
    if (!employee || !item)
      throw new Error('Unknown seed allocation reference');
    const allocationMonth = month(allocation.month);
    // Supplied amounts are person months; internal persistence stores full-precision hours.
    return {
      id: allocation.id,
      breakdownItemId: item.id,
      projectId: item.projectId,
      employeeId: employee.id,
      month: allocationMonth,
      hours: personMonthsToHours(
        allocation.amount,
        monthlyCapacityHours(
          employee.weeklyHours,
          getWorkingDays(allocationMonth).length,
        ),
      ),
    };
  });
  return { projects, breakdownItems, allocations };
}

/** Horizon extraction is independent of every domain collection. */
export function mapPlanningMonths(meta: RawBaselineSeed['meta']): YearMonth[] {
  const from = month(meta.gridHorizon.from);
  const to = month(meta.gridHorizon.to);
  const planningMonths: YearMonth[] = [];
  const cursor = parseDateOnly(`${from}-01`);
  for (
    ;
    cursor.toISOString().slice(0, 7) <= to;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  )
    planningMonths.push(month(cursor.toISOString().slice(0, 7)));
  if (planningMonths.length !== 12)
    throw new Error('Expected twelve seed planning months');
  return planningMonths;
}

/** Full mapping remains available for fixture invariants and explicit standalone composition. */
export function mapOfficialSeed(seed: RawBaselineSeed) {
  return {
    ...mapPeopleSeed(seed),
    ...mapDeliverySeed(seed),
    planningMonths: mapPlanningMonths(seed.meta),
  };
}
export const officialSeedVersion = `official-${rawSeed.meta.version}`;
export function createOfficialFixtures() {
  return mapOfficialSeed(rawSeed);
}
export const planningMonths: readonly YearMonth[] = Object.freeze(
  mapPlanningMonths(rawSeed.meta),
);

export function createOfficialPeopleFixtures() {
  return mapPeopleSeed(rawSeed);
}
export function createOfficialDeliveryFixtures() {
  return mapDeliverySeed(rawSeed);
}
