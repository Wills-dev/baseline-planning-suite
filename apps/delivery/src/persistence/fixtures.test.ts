import { expect, test } from 'vitest';
import { createDeliveryFixtures, planningMonths } from './fixtures';

test('Delivery fixtures have deterministic project and three-level WBS structure', () => {
  const fixtures = createDeliveryFixtures();
  expect(createDeliveryFixtures()).toEqual(fixtures);
  expect(fixtures.projects).toHaveLength(4);
  expect(new Set(fixtures.projects.map((project) => project.id)).size).toBe(4);
  expect(fixtures.breakdownItems).toHaveLength(90);
  const projects = new Set(fixtures.projects.map((project) => project.id));
  const items = new Map(fixtures.breakdownItems.map((item) => [item.id, item]));
  expect(items.size).toBe(90);
  for (const item of fixtures.breakdownItems) {
    expect(projects.has(item.projectId)).toBe(true);
    if (item.type === 'Deliverable') expect(item.parentId).toBeUndefined();
    else {
      const parent = item.parentId ? items.get(item.parentId) : undefined;
      expect(parent?.projectId).toBe(item.projectId);
      expect(parent?.type).toBe(
        item.type === 'WorkPackage' ? 'Deliverable' : 'WorkPackage',
      );
    }
  }
  for (const project of fixtures.projects) {
    expect(
      fixtures.breakdownItems.some(
        (item) => item.projectId === project.id && item.type === 'Activity',
      ),
    ).toBe(true);
  }
});

test('allocations cover 720 employee-month cells with valid canonical references', () => {
  const fixtures = createDeliveryFixtures();
  const projects = new Set(fixtures.projects.map((project) => project.id));
  const items = new Map(fixtures.breakdownItems.map((item) => [item.id, item]));
  // Shared deterministic fixture ID convention, not access to People repository internals.
  const employeeIds = new Set(
    Array.from(
      { length: 60 },
      (_, index) => `employee-${String(index + 1).padStart(2, '0')}`,
    ),
  );
  expect(planningMonths).toHaveLength(12);
  expect(planningMonths[0]).toBe('2026-01');
  expect(planningMonths.at(-1)).toBe('2026-12');
  expect(fixtures.allocations).toHaveLength(721);
  expect(
    new Set(fixtures.allocations.map((allocation) => allocation.id)).size,
  ).toBe(721);
  expect(
    new Set(
      fixtures.allocations.map(
        (allocation) => `${allocation.employeeId}:${allocation.month}`,
      ),
    ).size,
  ).toBe(720);
  for (const allocation of fixtures.allocations) {
    expect(employeeIds.has(allocation.employeeId)).toBe(true);
    expect(projects.has(allocation.projectId)).toBe(true);
    expect(items.get(allocation.breakdownItemId)).toMatchObject({
      projectId: allocation.projectId,
      type: 'Activity',
    });
    expect(planningMonths).toContain(allocation.month);
    expect(Number.isFinite(allocation.hours)).toBe(true);
    expect(allocation.hours).toBeGreaterThanOrEqual(0);
    expect(allocation).not.toHaveProperty('value');
    expect(allocation).not.toHaveProperty('unit');
  }
  for (const project of fixtures.projects) {
    expect(
      new Set(
        fixtures.allocations
          .filter((allocation) => allocation.projectId === project.id)
          .map((allocation) => allocation.month),
      ).size,
    ).toBe(12);
  }
});

test('reference and overlapping project scenarios are represented without detection logic', () => {
  const allocations = createDeliveryFixtures().allocations.filter(
    (allocation) =>
      allocation.employeeId === 'employee-01' && allocation.month === '2026-03',
  );
  expect(allocations).toHaveLength(2);
  expect(
    new Set(allocations.map((allocation) => allocation.projectId)).size,
  ).toBe(2);
  expect(
    allocations.find((allocation) => allocation.projectId === 'project-atlas')
      ?.hours,
  ).toBe(88);
  expect(
    allocations.find((allocation) => allocation.projectId === 'project-beacon')
      ?.hours,
  ).toBe(132);
});
