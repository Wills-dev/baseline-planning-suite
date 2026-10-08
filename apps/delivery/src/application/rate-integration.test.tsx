// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PlanningPeopleCapability } from '@baseline/contracts';
import { publishPeopleRateChanged } from '@baseline/contracts';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import DeliveryPage from '../DeliveryPage';

let repository: DeliveryRepository;
vi.mock('../persistence/delivery-repository', () => ({
  createDeliveryRepository: () => repository,
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repository = {
    initialize: async () => undefined,
    listProjects: async () => [{ id: 'p', name: 'Project' }],
    getProject: async () => ({ id: 'p', name: 'Project' }),
    listBreakdownItems: async () => [
      { id: 'leaf', projectId: 'p', type: 'Deliverable', name: 'Work' },
    ],
    listAllocations: async () => [
      {
        id: 'a',
        projectId: 'p',
        breakdownItemId: 'leaf',
        employeeId: 'e',
        month: '2026-04',
        hours: 88,
      },
    ],
    listProjectAllocations: async () => [],
    saveAllocation: vi.fn(),
    deleteAllocation: vi.fn(),
    saveBreakdownItem: vi.fn(),
    deleteBreakdownItem: vi.fn(),
    close: async () => undefined,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function change(label: string, value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(label)!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test('document invalidation targets one employee and updates Cost without losing selection or writing hours; StrictMode cleanup prevents duplicates', async () => {
  let rate = 80;
  const person = () => ({
    employeeId: 'e',
    name: 'Employee',
    weeklyHours: 40 as const,
    rates: [
      {
        id: 'r',
        employeeId: 'e',
        validFrom: '2025-01-01' as const,
        hourlyCostEUR: rate,
      },
    ],
  });
  const capability: PlanningPeopleCapability = {
    listPlanningPeople: vi.fn(async () => [person()]),
    getPlanningPerson: vi.fn(async () => person()),
  };
  const load = async () => capability;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(DeliveryPage, { loadPlanningPeople: load }),
      ),
    ),
  );
  await change('#delivery-project', 'p');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Select Deliverable: Work"]',
      )!
      .click(),
  );
  await change('#allocation-unit', 'Cost');
  const cell = container.querySelector<HTMLInputElement>(
    'input[aria-label="Employee, 2026-04, Work, Cost"]',
  )!;
  expect(Number(cell.value)).toBeCloseTo(7040, 10);
  rate = 95;
  await act(async () => publishPeopleRateChanged({ employeeId: 'e' }));
  expect(capability.getPlanningPerson).toHaveBeenCalledExactlyOnceWith('e');
  expect(Number(cell.value)).toBeCloseTo(8360, 10);
  expect(container.querySelector('#delivery-project')?.getAttribute('id')).toBe(
    'delivery-project',
  );
  expect(
    container.querySelector<HTMLSelectElement>('#allocation-unit')?.value,
  ).toBe('Cost');
  expect(repository.saveAllocation).not.toHaveBeenCalled();
  await change('#allocation-unit', 'Hours');
  expect(
    Number(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Employee, 2026-04, Work, Hours"]',
      )!.value,
    ),
  ).toBe(88);
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => publishPeopleRateChanged({ employeeId: 'e' }));
  expect(capability.getPlanningPerson).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(createElement(DeliveryPage, { loadPlanningPeople: load })),
  );
  await act(async () => publishPeopleRateChanged({ employeeId: 'e' }));
  expect(capability.getPlanningPerson).toHaveBeenCalledTimes(2);
});
