import {
  displayScale,
  reconcileRoundedUnits,
  reconcileRoundedMatrixUnits,
  type Allocation,
  type AllocationUnit,
  type BreakdownItem,
  type YearMonth,
} from '@baseline/domain';
import { hoursToDisplay, priceCellHours } from './allocation-values';
import type { PlanningPerson } from './planning-people';
import { buildWbsTree, type WbsNode } from './wbs';

export const displayPrecision: Readonly<Record<AllocationUnit, number>> = {
  Hours: 2,
  PM: 2,
  Percent: 1,
  Cost: 2,
};
const formats = Object.fromEntries(
  Object.entries(displayPrecision).map(([unit, digits]) => [
    unit,
    new Intl.NumberFormat('en', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      ...(unit === 'Cost' ? { style: 'currency', currency: 'EUR' } : {}),
    }),
  ]),
) as Record<AllocationUnit, Intl.NumberFormat>;

export function formatDisplayValue(
  value: number,
  unit: AllocationUnit,
): string {
  return formats[unit].format(value);
}
/** Number inputs require an ungrouped decimal string, unlike read-only output. */
export function formatInputValue(value: number, unit: AllocationUnit): string {
  return value.toFixed(displayPrecision[unit]);
}

/** Each root is rounded once; descendants inherit their parent's assigned units.
 * Null propagates upward, never becoming a zero Cost. Available subtrees still display.
 */
export function reconcileWbsDisplay(
  tree: readonly WbsNode[],
  leafValues: ReadonlyMap<string, number | null>,
  decimalPlaces: number,
): Map<string, number | null> {
  const exact = new Map<string, number | null>();
  function total(node: WbsNode): number | null {
    const values = node.children.map(total);
    const value = node.children.length
      ? values.some((child) => child === null)
        ? null
        : values.reduce<number>((sum, child) => sum + (child ?? 0), 0)
      : (leafValues.get(node.item.id) ?? null);
    exact.set(node.item.id, value);
    return value;
  }
  tree.forEach(total);
  const result = new Map<string, number | null>();
  const scale = displayScale(decimalPlaces);
  function assign(node: WbsNode, target?: number): void {
    const value = exact.get(node.item.id);
    if (value === null || value === undefined) {
      result.set(node.item.id, null);
      node.children.forEach((child) => assign(child));
      return;
    }
    const units =
      target ?? reconcileRoundedUnits([value], decimalPlaces)[0] ?? 0;
    result.set(node.item.id, units / scale);
    if (node.children.length) {
      const children = reconcileRoundedUnits(
        node.children.map((child) => exact.get(child.item.id) ?? 0),
        decimalPlaces,
        units,
      );
      node.children.forEach((child, index) => assign(child, children[index]));
    }
  }
  tree.forEach((node) => assign(node));
  return result;
}

/** Price each leaf allocation before aggregation; canonical hours are never changed. */
function deriveExactPlanningValues(
  tree: readonly WbsNode[],
  allocations: readonly Allocation[],
  person: PlanningPerson,
  month: YearMonth,
  unit: AllocationUnit,
): Map<string, number | null> {
  const hours = new Map<string, number>();
  const prices = new Map<string, number | null>();
  for (const allocation of allocations) {
    if (
      allocation.employeeId !== person.employeeId ||
      allocation.month !== month
    )
      continue;
    const id = allocation.breakdownItemId;
    hours.set(id, (hours.get(id) ?? 0) + allocation.hours);
    if (unit === 'Cost') {
      const price = priceCellHours(allocation.hours, person, month).costEUR;
      const previous = prices.get(id);
      prices.set(
        id,
        previous === null || price === null ? null : (previous ?? 0) + price,
      );
    }
  }
  const leafValues = new Map<string, number | null>();
  const emptyCost =
    unit === 'Cost' ? priceCellHours(0, person, month).costEUR : null;
  function leaves(nodes: readonly WbsNode[]): void {
    for (const node of nodes) {
      if (node.children.length) leaves(node.children);
      else
        leafValues.set(
          node.item.id,
          unit === 'Cost'
            ? prices.has(node.item.id)
              ? (prices.get(node.item.id) ?? null)
              : emptyCost
            : hoursToDisplay(hours.get(node.item.id) ?? 0, unit, person, month),
        );
    }
  }
  leaves(tree);
  return leafValues;
}

/** Existing single-month API retains its hierarchy reconciliation. */
export function derivePlanningDisplay(
  tree: readonly WbsNode[],
  allocations: readonly Allocation[],
  person: PlanningPerson,
  month: YearMonth,
  unit: AllocationUnit,
): Map<string, number | null> {
  return reconcileWbsDisplay(
    tree,
    deriveExactPlanningValues(tree, allocations, person, month, unit),
    displayPrecision[unit],
  );
}

export interface PlanningDisplayRow {
  months: ReadonlyMap<YearMonth, number | null>;
  total: number | null;
}

/** One display snapshot for the whole horizon, independent of selected WBS node.
 * Integer margins conserve both month columns and row totals through the hierarchy.
 * Unavailable values propagate; known siblings/months remain visible.
 */
export function derivePlanningGridDisplay(
  tree: readonly WbsNode[],
  allocations: readonly Allocation[],
  person: PlanningPerson,
  months: readonly YearMonth[],
  unit: AllocationUnit,
): Map<string, PlanningDisplayRow> {
  const precision = displayPrecision[unit],
    scale = displayScale(precision);
  const leaves = months.map((month) =>
    deriveExactPlanningValues(tree, allocations, person, month, unit),
  );
  const exact = new Map<string, (number | null)[]>();
  function calculate(node: WbsNode): (number | null)[] {
    const children = node.children.map(calculate);
    const values = months.map((_, index) => {
      if (!children.length) return leaves[index]!.get(node.item.id) ?? null;
      const parts = children.map((child) => child[index] ?? null);
      return parts.some((value) => value === null)
        ? null
        : parts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    });
    exact.set(node.item.id, values);
    return values;
  }
  tree.forEach(calculate);
  const result = new Map<string, PlanningDisplayRow>();
  function assign(node: WbsNode, assigned?: number[]): void {
    const values = exact.get(node.item.id)!;
    if (values.some((value) => value === null)) {
      node.children.forEach((child) => assign(child));
      const available = values.filter(
        (value): value is number => value !== null,
      );
      const rounded = reconcileRoundedUnits(available, precision);
      let availableIndex = 0;
      const monthly = values.map((value, index) =>
        value === null
          ? null
          : node.children.length
            ? node.children.reduce(
                (sum, child) =>
                  sum +
                  Math.round(
                    result.get(child.item.id)!.months.get(months[index]!)! *
                      scale,
                  ),
                0,
              ) / scale
            : rounded[availableIndex++]! / scale,
      );
      result.set(node.item.id, {
        months: new Map(months.map((month, index) => [month, monthly[index]!])),
        total: null,
      });
      return;
    }
    const numeric = values as number[];
    const units = assigned ?? reconcileRoundedUnits(numeric, precision);
    result.set(node.item.id, {
      months: new Map(
        months.map((month, index) => [month, units[index]! / scale]),
      ),
      total: units.reduce((sum, value) => sum + value, 0) / scale,
    });
    if (node.children.length) {
      const children = reconcileRoundedMatrixUnits(
        node.children.map((child) => exact.get(child.item.id)! as number[]),
        precision,
        units,
      );
      node.children.forEach((child, index) => assign(child, children[index]));
    }
  }
  tree.forEach((node) => assign(node));
  return result;
}

export function deriveWbsHoursDisplay(
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
): Map<string, number | null> {
  const values = new Map<string, number>();
  for (const allocation of allocations)
    values.set(
      allocation.breakdownItemId,
      (values.get(allocation.breakdownItemId) ?? 0) + allocation.hours,
    );
  for (const item of items) if (!values.has(item.id)) values.set(item.id, 0);
  return reconcileWbsDisplay(
    buildWbsTree(items),
    values,
    displayPrecision.Hours,
  );
}
