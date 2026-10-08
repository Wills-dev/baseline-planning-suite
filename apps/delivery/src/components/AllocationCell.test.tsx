// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AllocationCell } from './AllocationCell';
import { StaffingGrid } from './StaffingGrid';
import type { EditableUnit } from '../application/allocation-values';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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
const input = () => container.querySelector('input')!;
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(value: string) {
  await act(async () =>
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true }),
    ),
  );
}
async function render(
  value: number,
  onSave: (input: string) => Promise<boolean> = async () => true,
) {
  await act(async () =>
    root.render(
      createElement(AllocationCell, {
        value,
        label: 'allocation',
        disabled: false,
        readOnly: false,
        onSave,
      }),
    ),
  );
}

test('reconciles successful save to authoritative state, including later updates, without remount', async () => {
  let finish: ((saved: boolean) => void) | undefined;
  const onSave = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  await render(10, onSave);
  const original = input();
  await edit('12.34');
  await key('Enter');
  expect(onSave).toHaveBeenCalledWith('12.34');
  await render(12.345, onSave);
  expect(input().value).toBe('12.34');
  await act(async () => {
    finish?.(true);
  });
  expect(input()).toBe(original);
  expect(input().value).toBe('12.345');
  await render(15, onSave);
  expect(input().value).toBe('15');
});

test('keeps a dirty draft during authoritative updates and Escape restores the current value', async () => {
  await render(10);
  await edit('17');
  await render(20);
  expect(input().value).toBe('17');
  await key('Escape');
  expect(input().value).toBe('20');
  await render(25);
  expect(input().value).toBe('25');
});

test('failed save retains the local draft until Escape', async () => {
  await render(10, async () => false);
  await edit('17');
  await key('Enter');
  expect(input().value).toBe('17');
  await key('Escape');
  expect(input().value).toBe('10');
});

test('unit changes update the same logical grid input from authoritative hours', async () => {
  async function grid(unit: EditableUnit) {
    await act(async () =>
      root.render(
        createElement(StaffingGrid, {
          selectedId: 'leaf',
          items: [
            { id: 'leaf', projectId: 'p', type: 'Deliverable', name: 'Work' },
          ],
          allocations: [
            {
              id: 'a',
              projectId: 'p',
              breakdownItemId: 'leaf',
              employeeId: 'emp-001',
              month: '2026-03',
              hours: 88,
            },
          ],
          people: [
            { employeeId: 'emp-001', name: 'Adaeze Okafor', weeklyHours: 40 },
          ],
          planningMonths: ['2026-03'],
          unit,
          disabled: false,
          onSave: async () => true,
        }),
      ),
    );
  }
  await grid('Hours');
  const original = input();
  expect(original.value).toBe('88');
  await grid('PM');
  expect(input()).toBe(original);
  expect(input().value).toBe('0.5');
  await grid('Percent');
  expect(input()).toBe(original);
  expect(input().value).toBe('50');
});
