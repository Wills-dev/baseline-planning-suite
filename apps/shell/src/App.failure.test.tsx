// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';
import type { ShellRuntimeProps } from '@baseline/contracts';

const loaders = vi.hoisted(() => ({ people: vi.fn(), delivery: vi.fn() }));
vi.mock('./remote-pages', () => ({
  loadPeoplePage: loaders.people,
  loadDeliveryPage: loaders.delivery,
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function HealthyDelivery() {
  const [value, setValue] = useState('retained');
  return (
    <section>
      <h2>Healthy Delivery</h2>
      <input
        aria-label="Delivery draft"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </section>
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  loaders.people
    .mockReset()
    .mockResolvedValue({ default: () => <h2>Healthy People</h2> });
  loaders.delivery.mockReset().mockResolvedValue({ default: HealthyDelivery });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => root.render(<App />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === text,
  )!;
  await act(async () => button.click());
}
function assertShell() {
  expect(container.querySelector('h1')?.textContent).toBe(
    'Baseline Planning — Shell',
  );
  expect(container.querySelector('nav')?.textContent).toContain('People');
  expect(container.querySelector('nav')?.textContent).toContain('Delivery');
}

test('People rejection stays isolated; Delivery renders and its state survives navigation', async () => {
  loaders.people.mockRejectedValue(new Error('private stack detail'));
  await mount();
  expect(loaders.people).not.toHaveBeenCalled();
  expect(loaders.delivery).not.toHaveBeenCalled();
  await click('People');
  assertShell();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'People is unavailable',
  );
  expect(container.textContent).not.toContain('private stack detail');
  await click('Delivery');
  expect(container.textContent).toContain('Healthy Delivery');
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, 'unsaved selection');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('People');
  await click('Delivery');
  expect(container.querySelector('input')?.value).toBe('unsaved selection');
  expect(loaders.delivery).toHaveBeenCalledTimes(1);
});

test('Delivery rejection does not prevent People from rendering', async () => {
  loaders.delivery.mockRejectedValue(new Error('unavailable'));
  await mount();
  await click('Delivery');
  assertShell();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Delivery is unavailable',
  );
  await click('People');
  expect(container.textContent).toContain('Healthy People');
});

test('both failures retain independent fallbacks and Shell navigation', async () => {
  loaders.people.mockRejectedValue(new Error('unavailable'));
  loaders.delivery.mockRejectedValue(new Error('unavailable'));
  await mount();
  await click('People');
  await click('Delivery');
  assertShell();
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
  expect(
    container.querySelector('[hidden] [aria-label="People unavailable"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Delivery unavailable"]'),
  ).not.toBeNull();
});

test.each(['People', 'Delivery'] as const)(
  '%s render exceptions are isolated and retry uses a fresh lazy load',
  async (name) => {
    const Broken = () => {
      throw new Error('render exploded');
    };
    const loader = name === 'People' ? loaders.people : loaders.delivery;
    loader.mockResolvedValueOnce({ default: Broken });
    await mount();
    await click(name);
    assertShell();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      `${name} is unavailable`,
    );
    await click(`Retry ${name}`);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain(`Healthy ${name}`);
  },
);

test('retry recovers a rejected lazy promise without reloading a healthy sibling', async () => {
  loaders.people.mockRejectedValueOnce(new Error('first load failed'));
  await mount();
  await click('Delivery');
  await click('People');
  await click('Retry People');
  expect(container.textContent).toContain('Healthy People');
  expect(loaders.people).toHaveBeenCalledTimes(2);
  expect(loaders.delivery).toHaveBeenCalledTimes(1);
  assertShell();
});

test('a pending remote has its own accessible loading state while the sibling renders', async () => {
  let finish: ((value: { default: () => React.ReactNode }) => void) | undefined;
  loaders.people.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await click('People');
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Loading People…',
  );
  await click('Delivery');
  expect(container.textContent).toContain('Healthy Delivery');
  assertShell();
  await act(async () => finish?.({ default: () => <h2>Recovered People</h2> }));
  expect(container.textContent).toContain('Recovered People');
});

test('Shell context reaches both mounted remotes and currency updates preserve their local state', async () => {
  const received = { people: vi.fn(), delivery: vi.fn() };
  function People({ runtimeContext }: ShellRuntimeProps) {
    received.people(runtimeContext);
    const [draft] = useState('People selection retained');
    return (
      <section data-remote="people">
        {draft}: {runtimeContext.activeUser.id} /{' '}
        {runtimeContext.activeUser.name} / {runtimeContext.displayCurrency}
      </section>
    );
  }
  function Delivery({ runtimeContext }: ShellRuntimeProps) {
    received.delivery(runtimeContext);
    return (
      <section data-remote="delivery">
        <HealthyDelivery />
        {runtimeContext.activeUser.id} / {runtimeContext.activeUser.name} /{' '}
        {runtimeContext.displayCurrency}
      </section>
    );
  }
  loaders.people.mockResolvedValue({ default: People });
  loaders.delivery.mockResolvedValue({ default: Delivery });
  await mount();
  expect(container.textContent).toContain('Active user: Alex Morgan');
  await click('People');
  await click('Delivery');
  const originalPeople = container.querySelector('[data-remote="people"]');
  const originalInput = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(originalInput, 'Unsaved allocation');
    originalInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const initialContext = received.people.mock.lastCall![0];
  expect(initialContext).toEqual({
    displayCurrency: 'EUR',
    activeUser: { id: 'shell-planner', name: 'Alex Morgan' },
  });
  expect(received.delivery.mock.lastCall![0]).toBe(initialContext);
  await act(async () => {
    const currency = container.querySelector<HTMLSelectElement>(
      '#shell-display-currency',
    )!;
    currency.value = 'USD';
    currency.dispatchEvent(new Event('change', { bubbles: true }));
  });
  for (const remote of ['people', 'delivery']) {
    expect(
      container.querySelector(`[data-remote="${remote}"]`)?.textContent,
    ).toContain('shell-planner / Alex Morgan / USD');
  }
  expect(container.querySelector('[data-remote="people"]')).toBe(
    originalPeople,
  );
  expect(container.querySelector('input')).toBe(originalInput);
  expect(originalInput.value).toBe('Unsaved allocation');
  expect(received.people.mock.lastCall![0].activeUser).toBe(
    initialContext.activeUser,
  );
  expect(loaders.people).toHaveBeenCalledTimes(1);
  expect(loaders.delivery).toHaveBeenCalledTimes(1);
});
