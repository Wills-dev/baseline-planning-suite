import { expect, test } from 'vitest';
import type { Allocation, BreakdownItem } from '@baseline/domain';
import {
  assertCanDelete,
  buildWbsTree,
  descendantLeafIds,
  isLeaf,
  rollupHours,
  validateWbsItem,
  workItemPath,
} from './wbs';

const items: BreakdownItem[] = [
  { id: 'd1', projectId: 'p', type: 'Deliverable', name: 'Product' },
  { id: 'd2', projectId: 'p', type: 'Deliverable', name: 'Release' },
  {
    id: 'wp1',
    projectId: 'p',
    parentId: 'd1',
    type: 'WorkPackage',
    name: 'Core',
  },
  {
    id: 'wp2',
    projectId: 'p',
    parentId: 'd2',
    type: 'WorkPackage',
    name: 'Integration',
  },
  {
    id: 'a1',
    projectId: 'p',
    parentId: 'wp1',
    type: 'Activity',
    name: 'Build',
  },
  {
    id: 'a2',
    projectId: 'p',
    parentId: 'wp1',
    type: 'Activity',
    name: 'Verify',
  },
];
const allocations: Allocation[] = [
  {
    id: 'one',
    projectId: 'p',
    breakdownItemId: 'a1',
    employeeId: 'e',
    month: '2026-03',
    hours: 40,
  },
  {
    id: 'two',
    projectId: 'p',
    breakdownItemId: 'a2',
    employeeId: 'e',
    month: '2026-03',
    hours: 60,
  },
];

test('constructs the three-level tree and detects actual leaves without mutating input', () => {
  const before = structuredClone(items);
  const tree = buildWbsTree(items);
  expect(tree).toHaveLength(2);
  expect(tree[0]?.children[0]?.children.map((node) => node.item.id)).toEqual([
    'a1',
    'a2',
  ]);
  expect(isLeaf('a1', items)).toBe(true);
  expect(isLeaf('wp1', items)).toBe(false);
  expect(isLeaf('wp2', items)).toBe(true);
  expect(isLeaf('missing', items)).toBe(false);
  expect(items).toEqual(before);
  expect(workItemPath('a1', items)).toBe('Product > Core > Build');
});

test('accepts hierarchy-preserving moves and rejects invalid parents or type changes', () => {
  expect(() =>
    validateWbsItem({ ...items[2]!, parentId: 'd2' }, items, allocations),
  ).not.toThrow();
  expect(() =>
    validateWbsItem({ ...items[4]!, parentId: 'wp2' }, items, allocations),
  ).not.toThrow();
  expect(() =>
    validateWbsItem({ ...items[2]!, parentId: 'a1' }, items, allocations),
  ).toThrow('Deliverable parent');
  expect(() =>
    validateWbsItem({ ...items[4]!, parentId: undefined }, items, allocations),
  ).toThrow('WorkPackage parent');
  expect(() =>
    validateWbsItem({ ...items[0]!, parentId: 'a1' }, items, allocations),
  ).toThrow('root item');
  expect(() =>
    validateWbsItem(
      { ...items[4]!, type: 'Deliverable', parentId: undefined },
      items,
      allocations,
    ),
  ).toThrow('cannot change its type');
  expect(() =>
    validateWbsItem(
      {
        id: 'new',
        projectId: 'other',
        parentId: 'd1',
        type: 'WorkPackage',
        name: 'Cross project',
      },
      items,
      allocations,
    ),
  ).toThrow('in this project');
});

test('rejects malformed orphaned or duplicate-ID trees', () => {
  expect(() => buildWbsTree([...items, items[0]!])).toThrow('unique');
  expect(() =>
    buildWbsTree([
      {
        id: 'orphan',
        projectId: 'p',
        parentId: 'missing',
        type: 'Activity',
        name: 'Missing parent',
      },
    ]),
  ).toThrow('WorkPackage parent');
});

test('refuses to add or move a child under an allocated leaf', () => {
  const leafAllocation: Allocation = {
    ...allocations[0]!,
    breakdownItemId: 'wp2',
  };
  const child: BreakdownItem = {
    id: 'new',
    projectId: 'p',
    parentId: 'wp2',
    type: 'Activity',
    name: 'New activity',
  };
  expect(() => validateWbsItem(child, items, [leafAllocation])).toThrow(
    'allocated work item',
  );
  expect(() =>
    validateWbsItem({ ...items[4]!, parentId: 'wp2' }, items, [leafAllocation]),
  ).toThrow('allocated work item');
});

test('rejects deletion with children or allocations and permits an empty leaf', () => {
  expect(() => assertCanDelete('d1', items, allocations)).toThrow('children');
  expect(() => assertCanDelete('a1', items, allocations)).toThrow(
    'allocated item',
  );
  expect(() => assertCanDelete('wp2', items, allocations)).not.toThrow();
  expect(() => assertCanDelete('missing', items, allocations)).toThrow(
    'no longer exists',
  );
});

test('derives parent totals only from leaves, preserving precision and reflecting moves', () => {
  expect([...descendantLeafIds('d1', items)]).toEqual(['a1', 'a2']);
  expect(rollupHours('wp1', items, allocations)).toBe(100);
  expect(rollupHours('d1', items, allocations)).toBe(100);
  expect(rollupHours('d2', items, allocations)).toBe(0);
  const moved = items.map((item) =>
    item.id === 'a1' ? { ...item, parentId: 'wp2' } : item,
  );
  expect(rollupHours('d1', moved, allocations)).toBe(60);
  expect(rollupHours('d2', moved, allocations)).toBe(40);
  expect(
    rollupHours('d1', items, [
      { ...allocations[0]!, hours: 40.123456 },
      allocations[1]!,
    ]),
  ).toBe(100.123456);
});

test('rejects self-parenting and ancestor cycles before constructing a tree', () => {
  expect(() =>
    buildWbsTree(
      items.map((item) =>
        item.id === 'd1' ? { ...item, parentId: 'a1' } : item,
      ),
    ),
  ).toThrow('root item');
  expect(() =>
    buildWbsTree(
      items.map((item) =>
        item.id === 'wp1' ? { ...item, parentId: 'wp1' } : item,
      ),
    ),
  ).toThrow('Deliverable parent');
});

test('ignores stored parent values when deriving descendant leaf totals', () => {
  const parentRecord: Allocation = {
    ...allocations[0]!,
    id: 'invalid-parent-total',
    breakdownItemId: 'wp1',
    hours: 100,
  };
  expect(rollupHours('d1', items, [...allocations, parentRecord])).toBe(100);
  expect(rollupHours('wp1', items, [...allocations, parentRecord])).toBe(100);
});
