// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import type { ShellRuntimeProps } from '@baseline/contracts';
import { createElement, type ComponentType } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const runtime = vi.hoisted(() => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}));
vi.mock('@module-federation/runtime', () => runtime);
let loaders: typeof import('./remote-pages');
const Page = () => createElement('h2', null, 'Remote page');
function config(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(async () => {
  vi.resetModules();
  runtime.loadRemote.mockReset().mockResolvedValue({ default: Page });
  runtime.registerRemotes.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () =>
      config({
        people: 'https://people.example/remoteEntry.js',
        delivery: 'https://delivery.example/remoteEntry.js',
      }),
    ),
  );
  loaders = await import('./remote-pages');
});
afterEach(() => vi.unstubAllGlobals());

test.each([undefined, '', 7, 'javascript:alert(1)', 'http://'])(
  'bad People URL %s does not poison Delivery',
  async (people) => {
    vi.mocked(fetch).mockResolvedValue(
      config({
        people,
        delivery: 'https://delivery.example/remoteEntry.js',
      }) as Response,
    );
    await expect(loaders.loadPeoplePage()).rejects.toThrow(/people remote URL/);
    await expect(loaders.loadDeliveryPage()).resolves.toHaveProperty('default');
    expect(runtime.registerRemotes).toHaveBeenCalledExactlyOnceWith(
      [
        {
          name: 'delivery',
          entry: 'https://delivery.example/remoteEntry.js',
          type: 'module',
        },
      ],
      { force: false },
    );
    expect(runtime.loadRemote).toHaveBeenCalledExactlyOnceWith(
      'delivery/DeliveryPage',
    );
  },
);

test('bad Delivery URL does not poison People', async () => {
  vi.mocked(fetch).mockResolvedValue(
    config({ people: 'https://people.example/remoteEntry.js' }) as Response,
  );
  await expect(loaders.loadDeliveryPage()).rejects.toThrow('Missing delivery');
  await expect(loaders.loadPeoplePage()).resolves.toHaveProperty('default');
});

test.each([null, [], 'invalid'])(
  'invalid config shape %j fails explicitly and can recover',
  async (value) => {
    vi.mocked(fetch).mockResolvedValueOnce(config(value) as Response);
    await expect(loaders.loadPeoplePage()).rejects.toThrow(
      'Invalid remote configuration',
    );
    await expect(loaders.loadPeoplePage(true)).resolves.toHaveProperty(
      'default',
    );
  },
);

test('configuration network, status, and JSON failures reject without permanently caching failure', async () => {
  vi.mocked(fetch)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response('{'));
  await expect(loaders.loadPeoplePage()).rejects.toThrow('offline');
  await expect(loaders.loadDeliveryPage()).rejects.toThrow(
    'Could not load remote configuration',
  );
  await expect(loaders.loadPeoplePage()).rejects.toThrow(SyntaxError);
  await expect(loaders.loadDeliveryPage()).resolves.toHaveProperty('default');
});

test('a failed entry/exposure rejects only its requested page', async () => {
  runtime.loadRemote.mockRejectedValueOnce(new Error('entry unavailable'));
  await expect(loaders.loadPeoplePage()).rejects.toThrow('entry unavailable');
  await expect(loaders.loadDeliveryPage()).resolves.toHaveProperty('default');
  runtime.loadRemote.mockResolvedValueOnce(null);
  await expect(loaders.loadPeoplePage()).rejects.toThrow(
    'PeoplePage was not returned',
  );
  runtime.loadRemote.mockResolvedValueOnce({});
  await expect(loaders.loadDeliveryPage()).rejects.toThrow(
    'DeliveryPage was not returned',
  );
});

test('retry re-reads config and forces only the failed remote with a fresh entry URL', async () => {
  await loaders.loadDeliveryPage();
  runtime.loadRemote.mockRejectedValueOnce(new Error('offline'));
  await expect(loaders.loadPeoplePage()).rejects.toThrow('offline');
  await loaders.loadPeoplePage(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(runtime.registerRemotes).toHaveBeenLastCalledWith(
    [
      {
        name: 'people',
        entry: 'https://people.example/remoteEntry.js?baseline-retry=1',
        type: 'module',
      },
    ],
    { force: true },
  );
  expect(
    runtime.registerRemotes.mock.calls.filter(
      (call) => call[0][0].name === 'delivery',
    ),
  ).toHaveLength(1);
});

test('Delivery page resolves before any People capability call, whose failure stays separate and retries', async () => {
  const hosted = await loaders.loadDeliveryPage();
  expect(runtime.loadRemote).toHaveBeenCalledExactlyOnceWith(
    'delivery/DeliveryPage',
  );
  const element = (
    hosted.default as (
      props: object,
    ) => React.ReactElement<{ loadPlanningPeople: () => Promise<unknown> }>
  )({
    runtimeContext: {
      displayCurrency: 'EUR',
      activeUser: { id: 'test', name: 'Test user' },
    },
  });
  expect(element.type).toBe(Page as ComponentType);
  runtime.loadRemote.mockRejectedValueOnce(new Error('capability offline'));
  await expect(element.props.loadPlanningPeople()).rejects.toThrow(
    'capability offline',
  );
  const capability = {
    listPlanningPeople: vi.fn(),
    getPlanningPerson: vi.fn(),
  };
  runtime.loadRemote.mockResolvedValueOnce(capability);
  await expect(element.props.loadPlanningPeople()).resolves.toBe(capability);
  expect(runtime.registerRemotes).toHaveBeenLastCalledWith(
    [
      {
        name: 'people',
        entry: 'https://people.example/remoteEntry.js?baseline-retry=1',
        type: 'module',
      },
    ],
    { force: true },
  );
});

test('invalid capability is rejected without replacing it with bootstrap data', async () => {
  runtime.loadRemote.mockResolvedValueOnce({ listPlanningPeople: vi.fn() });
  await expect(loaders.loadPlanningPeopleCapability()).rejects.toThrow(
    'People planning capability unavailable',
  );
});

test('simultaneous loaders resolve independently using one configuration request', async () => {
  runtime.loadRemote.mockImplementation(async (id: string) => {
    if (id === 'people/PeoplePage') throw new Error('People failed');
    return { default: Page };
  });
  const results = await Promise.allSettled([
    loaders.loadPeoplePage(),
    loaders.loadDeliveryPage(),
  ]);
  expect(results[0]?.status).toBe('rejected');
  expect(results[1]?.status).toBe('fulfilled');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('federated page loaders forward runtime context without losing the Delivery capability injection', async () => {
  const received = vi.fn();
  function Remote(props: ShellRuntimeProps & { loadPlanningPeople?: unknown }) {
    received(props);
    return createElement('p', null, props.runtimeContext.activeUser.name);
  }
  runtime.loadRemote.mockResolvedValue({ default: Remote });
  const runtimeContext = {
    displayCurrency: 'GBP' as const,
    activeUser: { id: 'host-user', name: 'Host user' },
  };
  for (const load of [loaders.loadPeoplePage, loaders.loadDeliveryPage]) {
    const { default: Hosted } = await load();
    expect(
      renderToStaticMarkup(createElement(Hosted, { runtimeContext })),
    ).toContain('Host user');
    expect(received.mock.lastCall![0].runtimeContext).toBe(runtimeContext);
  }
  expect(received.mock.lastCall![0].loadPlanningPeople).toBe(
    loaders.loadPlanningPeopleCapability,
  );
});

test('People page loads without Delivery and its injected capacity capability fails independently then retries', async () => {
  const hosted = await loaders.loadPeoplePage();
  expect(runtime.loadRemote).toHaveBeenCalledExactlyOnceWith(
    'people/PeoplePage',
  );
  const element = (
    hosted.default as (
      props: ShellRuntimeProps,
    ) => React.ReactElement<{ loadCapacity: () => Promise<unknown> }>
  )({
    runtimeContext: {
      displayCurrency: 'EUR',
      activeUser: { id: 'e', name: 'User' },
    },
  });
  runtime.loadRemote.mockRejectedValueOnce(new Error('capacity offline'));
  await expect(element.props.loadCapacity()).rejects.toThrow(
    'capacity offline',
  );
  const capability = { listCapacityStatuses: vi.fn() };
  runtime.loadRemote.mockResolvedValueOnce(capability);
  await expect(element.props.loadCapacity()).resolves.toBe(capability);
  expect(runtime.loadRemote).toHaveBeenLastCalledWith('delivery/Capacity');
});

test('production runtime configuration uses same-origin entries for pages and never development defaults', async () => {
  const { default: production } =
    await import('../../../deployment/runtime/shell.json');
  vi.mocked(fetch).mockResolvedValue(config(production));
  await loaders.loadPeoplePage();
  await loaders.loadDeliveryPage();
  expect(
    runtime.registerRemotes.mock.calls.map(([entries]) => entries[0].entry),
  ).toEqual([
    new URL('/people/remoteEntry.js', location.href).href,
    new URL('/delivery/remoteEntry.js', location.href).href,
  ]);
  expect(fetch).toHaveBeenCalledWith('/remote-config.json', {
    cache: 'no-store',
  });
});

test('unavailable production runtime configuration rejects rather than selecting development ports', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('offline', { status: 503 }));
  await expect(loaders.loadPeoplePage()).rejects.toThrow(
    'Could not load remote configuration',
  );
  expect(runtime.registerRemotes).not.toHaveBeenCalled();
  expect(runtime.loadRemote).not.toHaveBeenCalled();
});

test('development runtime configuration still registers development entries', async () => {
  const { default: development } = await import('../public/remote-config.json');
  vi.mocked(fetch).mockResolvedValue(config(development));
  await loaders.loadPeoplePage();
  expect(runtime.registerRemotes).toHaveBeenCalledWith(
    [{ name: 'people', entry: development.people, type: 'module' }],
    { force: false },
  );
});
