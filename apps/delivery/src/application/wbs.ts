import type { Allocation, BreakdownItem } from '@baseline/domain';
import { PlanningInputError } from './planning-error';

export interface WbsNode {
  item: BreakdownItem;
  children: WbsNode[];
}

export function isLeaf(id: string, items: readonly BreakdownItem[]): boolean {
  return (
    items.some((item) => item.id === id) &&
    !items.some((item) => item.parentId === id)
  );
}

export function validateWbsItem(
  item: BreakdownItem,
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
): void {
  if (!item.name.trim())
    throw new PlanningInputError('Enter a work item name.');
  const existing = items.find((other) => other.id === item.id);
  if (
    existing &&
    (existing.type !== item.type || existing.projectId !== item.projectId)
  )
    throw new PlanningInputError(
      'An existing work item cannot change its type or project.',
    );
  if (item.type === 'Deliverable') {
    if (item.parentId)
      throw new PlanningInputError('A Deliverable must be a root item.');
    return;
  }
  const parent = items.find((other) => other.id === item.parentId);
  const expected = item.type === 'WorkPackage' ? 'Deliverable' : 'WorkPackage';
  if (
    !parent ||
    parent.type !== expected ||
    parent.projectId !== item.projectId ||
    parent.id === item.id
  )
    throw new PlanningInputError(
      `${item.type} must have a ${expected} parent in this project.`,
    );
  if (
    (!existing || existing.parentId !== parent.id) &&
    allocations.some((allocation) => allocation.breakdownItemId === parent.id)
  )
    throw new PlanningInputError(
      'Cannot add or move a child beneath an allocated work item. Remove its allocations first.',
    );
}

export function assertCanDelete(
  id: string,
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
): void {
  if (!items.some((item) => item.id === id))
    throw new PlanningInputError(
      'This work item no longer exists. Reload the project.',
    );
  if (items.some((item) => item.parentId === id))
    throw new PlanningInputError(
      'Cannot delete an item with children. Move or delete its children first.',
    );
  if (allocations.some((allocation) => allocation.breakdownItemId === id))
    throw new PlanningInputError(
      'Cannot delete an allocated item. Remove its allocations first.',
    );
}

export function buildWbsTree(items: readonly BreakdownItem[]): WbsNode[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new PlanningInputError('Work item IDs must be unique.');
  for (const item of items) validateWbsItem(item, items, []);
  const children = new Map<string | undefined, BreakdownItem[]>();
  for (const item of items) {
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }
  const nodes = (parentId?: string): WbsNode[] =>
    (children.get(parentId) ?? []).map((item) => ({
      item,
      children: nodes(item.id),
    }));
  return nodes();
}

export function descendantLeafIds(
  id: string,
  items: readonly BreakdownItem[],
): Set<string> {
  if (!items.some((item) => item.id === id)) return new Set();
  const children = items.filter((item) => item.parentId === id);
  return children.length === 0
    ? new Set([id])
    : new Set(
        children.flatMap((item) => [...descendantLeafIds(item.id, items)]),
      );
}

/** Hours only; derived from leaf records, never persisted on parent work items. */
export function rollupHours(
  id: string,
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
): number {
  const leaves = descendantLeafIds(id, items);
  return allocations
    .filter((allocation) => leaves.has(allocation.breakdownItemId))
    .reduce((total, allocation) => total + allocation.hours, 0);
}

export function workItemPath(
  id: string,
  items: readonly BreakdownItem[],
): string {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return '';
  return item.parentId
    ? `${workItemPath(item.parentId, items)} > ${item.name}`
    : item.name;
}
