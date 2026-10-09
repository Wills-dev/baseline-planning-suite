import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type { DeliveryCapacityCapability } from '@baseline/contracts';

let failed = false;
let attempt = 0;

/** Standalone resolves the configured public authority, never fixture allocations. */
export async function loadStandaloneCapacity(): Promise<DeliveryCapacityCapability> {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}remote-config.json`,
      { cache: 'no-store' },
    );
    if (!response.ok)
      throw new Error('Delivery capacity configuration unavailable');
    const config: unknown = await response.json();
    if (
      typeof config !== 'object' ||
      config === null ||
      !('delivery' in config) ||
      typeof config.delivery !== 'string'
    )
      throw new Error('Delivery capacity configuration unavailable');
    const entry = new URL(config.delivery, globalThis.location?.href);
    if (!['http:', 'https:'].includes(entry.protocol))
      throw new Error('Invalid Delivery URL');
    if (failed)
      entry.searchParams.set('baseline-capacity-retry', String(++attempt));
    registerRemotes([{ name: 'delivery', entry: entry.href, type: 'module' }], {
      force: failed,
    });
    const capability =
      await loadRemote<DeliveryCapacityCapability>('delivery/Capacity');
    if (!capability || typeof capability.listCapacityStatuses !== 'function')
      throw new Error('Delivery capacity unavailable');
    failed = false;
    return capability;
  } catch (error) {
    failed = true;
    throw error;
  }
}
