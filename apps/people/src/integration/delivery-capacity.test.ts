// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
const runtime = vi.hoisted(() => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}));
vi.mock('@module-federation/runtime', () => runtime);
afterEach(() => vi.unstubAllGlobals());
test('standalone capacity uses configured Delivery URL and retries a failed authority without fixture fallback', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            delivery: 'https://delivery.example/remoteEntry.js',
          }),
        ),
    ),
  );
  const { loadStandaloneCapacity } = await import('./delivery-capacity');
  runtime.loadRemote.mockRejectedValueOnce(new Error('offline'));
  await expect(loadStandaloneCapacity()).rejects.toThrow('offline');
  const capability = { listCapacityStatuses: vi.fn() };
  runtime.loadRemote.mockResolvedValueOnce(capability);
  await expect(loadStandaloneCapacity()).resolves.toBe(capability);
  expect(runtime.loadRemote).toHaveBeenLastCalledWith('delivery/Capacity');
  expect(runtime.registerRemotes).toHaveBeenLastCalledWith(
    [
      {
        name: 'delivery',
        entry:
          'https://delivery.example/remoteEntry.js?baseline-capacity-retry=1',
        type: 'module',
      },
    ],
    { force: true },
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ delivery: null })),
  );
  await expect(loadStandaloneCapacity()).rejects.toThrow(
    'configuration unavailable',
  );
});
