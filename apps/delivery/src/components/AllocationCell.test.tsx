// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AllocationCell } from './AllocationCell';
import { StaffingGrid } from './StaffingGrid';
import type { RateRecord } from '@baseline/domain';
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
  expect(input().value).toBe('12.35');
  await render(15, onSave);
  expect(input().value).toBe('15.00');
});

test('keeps a dirty draft during authoritative updates and Escape restores the current value', async () => {
  await render(10);
  await edit('17');
  await render(20);
  expect(input().value).toBe('17');
  await key('Escape');
  expect(input().value).toBe('20.00');
  await render(25);
  expect(input().value).toBe('25.00');
});

test('failed save retains the local draft until Escape', async () => {
  await render(10, async () => false);
  await edit('17');
  await key('Enter');
  expect(input().value).toBe('17');
  await key('Escape');
  expect(input().value).toBe('10.00');
});

test('unit changes update the same logical grid input from authoritative hours', async () => {
  async function grid(unit: EditableUnit) {
    await act(async () =>
      root.render(
        createElement(StaffingGrid, {
          selectedId: 'leaf',
          capacityStatuses: new Map(),
          latestCapacityEdits: new Map(),
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
            {
              employeeId: 'emp-001',
              name: 'Adaeze Okafor',
              weeklyHours: 40,
              rates: [],
            },
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
  expect(original.value).toBe('88.00');
  await grid('PM');
  expect(input()).toBe(original);
  expect(input().value).toBe('0.50');
  await grid('Percent');
  expect(input()).toBe(original);
  expect(input().value).toBe('50.0');
});

test('parent Cost sums individually priced descendants and stays read-only; missing rates show unavailable', async () => {
  const person = {
    employeeId: 'e',
    name: 'Employee',
    weeklyHours: 40 as const,
    rates: [
      {
        id: 'r1',
        employeeId: 'e',
        validFrom: '2025-01-01' as const,
        hourlyCostEUR: 80,
      },
      {
        id: 'r2',
        employeeId: 'e',
        validFrom: '2026-03-12' as const,
        hourlyCostEUR: 95,
      },
    ],
  };
  const items = [
    {
      id: 'parent',
      projectId: 'p',
      name: 'Parent',
      type: 'Deliverable' as const,
    },
    {
      id: 'a',
      projectId: 'p',
      name: 'A',
      type: 'WorkPackage' as const,
      parentId: 'parent',
    },
    {
      id: 'b',
      projectId: 'p',
      name: 'B',
      type: 'WorkPackage' as const,
      parentId: 'parent',
    },
  ];
  const allocations = [
    {
      id: 'one',
      projectId: 'p',
      breakdownItemId: 'a',
      employeeId: 'e',
      month: '2026-03' as const,
      hours: 88,
    },
    {
      id: 'two',
      projectId: 'p',
      breakdownItemId: 'b',
      employeeId: 'e',
      month: '2026-03' as const,
      hours: 44,
    },
  ];
  const onSave = vi.fn(async () => true);
  async function grid(
    rates: RateRecord[] = person.rates,
    selectedId = 'parent',
    rateDataError?: string,
  ) {
    await act(async () =>
      root.render(
        createElement(StaffingGrid, {
          selectedId,
          items,
          allocations,
          people: [
            { ...person, rates, ...(rateDataError ? { rateDataError } : {}) },
          ],
          planningMonths: ['2026-03'],
          unit: 'Cost',
          disabled: false,
          onSave,
          capacityStatuses: new Map(),
          latestCapacityEdits: new Map(),
        }),
      ),
    );
  }
  await grid();
  expect(container.querySelector('output')?.textContent).toBe('€11,820.00');
  expect(container.querySelector('input')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
  await grid([]);
  expect(container.textContent).toContain(
    'Cost unavailable: no applicable rate.',
  );
  expect(container.textContent).not.toContain('€0');
  const future: RateRecord[] = [
    { ...person.rates[0]!, validFrom: '2026-04-01' },
  ];
  for (const selectedId of ['a', 'parent']) {
    await grid(future, selectedId);
    const output = container.querySelector('output')!;
    expect(output.textContent).toBe('€0.00');
    const mark = container.querySelector('.delivery-before-first-rate')!;
    expect(mark.textContent).toContain('month before first rate');
    expect(mark.getAttribute('title')).toContain(
      "employee's first rate record",
    );
    expect(output.getAttribute('aria-describedby')?.split(' ')).toContain(
      mark.id,
    );
  }
  await grid(
    person.rates.map((rate) => ({ ...rate, hourlyCostEUR: 0 })),
    'a',
  );
  expect(container.querySelector('output')?.textContent).toBe('€0.00');
  expect(container.querySelector('.delivery-before-first-rate')).toBeNull();
  await grid(future, 'parent', 'People authority unavailable');
  expect(container.textContent).toContain('People authority unavailable');
  expect(container.querySelector('.delivery-before-first-rate')).toBeNull();
  expect(
    container.querySelector('.delivery-row-total output')?.textContent,
  ).toBe('Cost unavailable');
  expect(
    container.querySelector('td:not(.delivery-row-total) output'),
  ).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
});

test('global capacity warnings remain accessible on editable and read-only cells', async () => {
  const capacityStatus = {
    employeeId: 'e',
    month: '2026-06' as const,
    allocatedHours: 220,
    capacityHours: 176,
    utilizationPercent: 125,
    overAllocated: true,
  };
  await act(async () =>
    root.render(
      createElement(AllocationCell, {
        value: 88,
        label: 'allocation',
        disabled: false,
        readOnly: false,
        onSave: async () => true,
        capacityStatus,
        latestEdit: true,
      }),
    ),
  );
  expect(container.textContent).toContain(
    '125.0% allocated across all projects',
  );
  expect(container.textContent).toContain('Latest edit saved');
  const description = input()
    .getAttribute('aria-describedby')!
    .split(' ')
    .at(-1)!;
  expect(document.getElementById(description)?.textContent).toContain('125.0%');
  await act(async () =>
    root.render(
      createElement(AllocationCell, {
        value: 88,
        label: 'allocation',
        disabled: false,
        readOnly: true,
        onSave: async () => true,
        capacityStatus: {
          ...capacityStatus,
          overAllocated: false,
          utilizationPercent: 100,
        },
      }),
    ),
  );
  expect(container.querySelector('input')).toBeNull();
  expect(container.textContent).not.toContain('Over capacity');
});

test('rounded clean display never saves; an edited value keeps full input precision', async () => {
  const onSave = vi.fn(async () => true);
  await render(87.99999999997, onSave);
  expect(input().value).toBe('88.00');
  await key('Enter');
  await act(async () =>
    input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
  );
  expect(onSave).not.toHaveBeenCalled();
  await edit('87.99999999997');
  expect(input().value).toBe('87.99999999997');
  await key('Enter');
  expect(onSave).toHaveBeenCalledExactlyOnceWith('87.99999999997');
});

test('exact over-capacity status still warns when display rounds to 100.0%', async () => {
  await act(async () =>
    root.render(
      createElement(AllocationCell, {
        value: 33.4,
        unit: 'Percent',
        label: 'allocation',
        disabled: false,
        readOnly: false,
        onSave: async () => true,
        capacityStatus: {
          employeeId: 'e',
          month: '2026-06' as const,
          allocatedHours: 176.0704,
          capacityHours: 176,
          utilizationPercent: 100.04,
          overAllocated: true,
        },
      }),
    ),
  );
  expect(input().value).toBe('33.4');
  expect(container.textContent).toContain('Over capacity: 100.0%');
});

test('visible TOTAL reconciles monthly cells in all units, is read-only, preserves R5 attribution and never saves on unit switching', async () => {
  const onSave = vi.fn(async () => true);
  const records = ['2026-04', '2026-05', '2026-06'].map((month, index) => ({
    id: String(index),
    projectId: 'p',
    breakdownItemId: 'leaf',
    employeeId: 'e',
    month: month as '2026-04' | '2026-05' | '2026-06',
    hours: 88.00371429 + index * 0.00581231,
  }));
  const before = structuredClone(records);
  for (const unit of ['Hours', 'PM', 'Percent', 'Cost'] as const) {
    await act(async () =>
      root.render(
        createElement(StaffingGrid, {
          selectedId: 'leaf',
          items: [
            { id: 'leaf', projectId: 'p', name: 'Work', type: 'Deliverable' },
          ],
          allocations: records,
          people: [
            {
              employeeId: 'e',
              name: 'Employee',
              weeklyHours: 40,
              rates: [
                {
                  id: 'r',
                  employeeId: 'e',
                  validFrom: '2025-01-01',
                  hourlyCostEUR: 89.12345,
                },
              ],
            },
          ],
          planningMonths: ['2026-04', '2026-05', '2026-06'],
          unit,
          disabled: false,
          onSave,
          capacityStatuses: new Map([
            [
              '["e","2026-06"]',
              {
                employeeId: 'e',
                month: '2026-06' as const,
                capacityHours: 176,
                allocatedHours: 220,
                utilizationPercent: 125,
                overAllocated: true,
              },
            ],
          ]),
          latestCapacityEdits: new Map([
            [
              '["e","2026-06"]',
              {
                projectId: 'p',
                breakdownItemId: 'leaf',
                assignmentName: 'Project / Work',
              },
            ],
          ]),
        }),
      ),
    );
    expect(
      container.querySelector('thead .delivery-row-total')!.textContent,
    ).toBe('TOTAL');
    const scale = unit === 'Percent' ? 10 : 100;
    const total = Number(
      container
        .querySelector('.delivery-row-total output')!
        .textContent!.replace(/[€,]/g, ''),
    );
    const sum = [
      ...container.querySelectorAll<HTMLInputElement>('td input'),
    ].reduce((sum, input) => sum + Math.round(Number(input.value) * scale), 0);
    expect(sum).toBe(Math.round(total * scale));
    expect(container.querySelector('.delivery-row-total input')).toBeNull();
    expect(container.textContent).toContain(
      'Latest contributing assignment: Project / Work',
    );
  }
  expect(records).toEqual(before);
  expect(onSave).not.toHaveBeenCalled();
});
