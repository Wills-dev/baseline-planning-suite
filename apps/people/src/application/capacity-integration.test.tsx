// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { publishDeliveryAllocationsChanged } from '@baseline/contracts';
import type { DeliveryCapacityCapability } from '@baseline/contracts';
import PeoplePage from '../PeoplePage';

vi.mock('../persistence/people-repository', () => ({
  createPeopleRepository: () => ({
    initialize: async () => undefined,
    listEmployees: async () => [
      { id: 'e', name: 'Ada', role: 'Lead', weeklyHours: 40 },
      { id: 'other', name: 'Lena', role: 'Engineer', weeklyHours: 32 },
    ],
    listRateHistory: async () => [],
  }),
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const runtimeContext = {
  displayCurrency: 'EUR' as const,
  activeUser: { id: 'host', name: 'Planner' },
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('People register uses authoritative status, refreshes live, preserves selection, and cleans up listeners', async () => {
  let over = true;
  const read = vi.fn(async () => [
    { employeeId: 'e', oversubscribedMonths: over ? ['2026-06' as const] : [] },
    { employeeId: 'other', oversubscribedMonths: [] },
  ]);
  const capability: DeliveryCapacityCapability = { listCapacityStatuses: read };
  const load = async () => capability;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(PeoplePage, { runtimeContext, loadCapacity: load }),
      ),
    ),
  );
  const rows = container.querySelectorAll('tbody tr');
  expect(rows[0]!.textContent).toContain('Ada — Oversubscribed');
  expect(rows[0]!.querySelector('span')!.title).toContain('2026-06');
  expect(rows[1]!.textContent).not.toContain('Oversubscribed');
  expect(read).toHaveBeenLastCalledWith([
    { employeeId: 'e', weeklyHours: 40 },
    { employeeId: 'other', weeklyHours: 32 },
  ]);
  await act(async () =>
    (rows[0]!.querySelector('button') as HTMLButtonElement).click(),
  );
  expect(container.textContent).toContain('Rate history');
  over = false;
  const count = read.mock.calls.length;
  await act(async () => publishDeliveryAllocationsChanged({ employeeId: 'e' }));
  expect(read).toHaveBeenCalledTimes(count + 1);
  expect(container.textContent).not.toContain('Oversubscribed');
  expect(
    container.querySelector('button[aria-pressed="true"]')!.textContent,
  ).toBe('Ada');
  await act(async () => root.unmount());
  publishDeliveryAllocationsChanged({ employeeId: 'e' });
  expect(read).toHaveBeenCalledTimes(count + 1);
  root = createRoot(container);
});

test('capacity authority failure never pretends within capacity and employee/rate UI stays usable; retry recovers', async () => {
  const load = vi
    .fn<() => Promise<DeliveryCapacityCapability>>()
    .mockRejectedValue(new Error('offline'));
  await act(async () =>
    root.render(
      createElement(PeoplePage, { runtimeContext, loadCapacity: load }),
    ),
  );
  expect(container.textContent).toContain('Capacity status unavailable');
  expect(container.textContent).toContain('Ada');
  expect(container.textContent).not.toContain('Oversubscribed');
  const ada = container.querySelector('tbody button') as HTMLButtonElement;
  await act(async () => ada.click());
  expect(container.textContent).toContain('Rate history');
  load.mockResolvedValue({
    listCapacityStatuses: async () => [
      { employeeId: 'e', oversubscribedMonths: ['2026-06'] },
      { employeeId: 'other', oversubscribedMonths: [] },
    ],
  });
  await act(async () =>
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Retry capacity status')!
      .click(),
  );
  expect(container.textContent).toContain('Oversubscribed');
  expect(container.textContent).not.toContain('Capacity status unavailable');
});
