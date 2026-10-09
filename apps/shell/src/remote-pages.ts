import { createElement } from 'react';
import type { ComponentType } from 'react';
import type {
  ShellRuntimeProps,
  DeliveryCapacityCapability,
  DeliveryCapacityLoader,
  PlanningPeopleCapability,
  PlanningPeopleLoader,
} from '@baseline/contracts';
import { loadRemote, registerRemotes } from '@module-federation/runtime';

interface RemotePageModule {
  default: ComponentType<ShellRuntimeProps>;
}
type RemoteName = 'people' | 'delivery';

let configuration: Promise<unknown> | undefined;
const registered = new Map<RemoteName, string>();
const attempts: Record<RemoteName, number> = { people: 0, delivery: 0 };

function readConfiguration(): Promise<unknown> {
  if (configuration) return configuration;
  const request = fetch(`${import.meta.env.BASE_URL}remote-config.json`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not load remote configuration');
      const value: unknown = await response.json();
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('Invalid remote configuration');
      return value;
    })
    .catch((error: unknown) => {
      if (configuration === request) configuration = undefined;
      throw error;
    });
  configuration = request;
  return request;
}

/** Validate/register only the requested remote, independently of its sibling. */
async function registerConfiguredRemote(
  name: RemoteName,
  retry = false,
): Promise<void> {
  if (retry) configuration = undefined;
  const config = await readConfiguration();
  const value = (config as Record<string, unknown>)[name];
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Missing ${name} remote URL`);
  let entry: URL;
  try {
    entry = new URL(value, globalThis.location?.href);
  } catch {
    throw new Error(`Invalid ${name} remote URL`);
  }
  if (!['http:', 'https:'].includes(entry.protocol))
    throw new Error(`Invalid ${name} remote URL`);
  if (retry) {
    // A new entry URL also avoids the browser's cached rejected ESM import.
    entry.searchParams.set('baseline-retry', String(++attempts[name]));
  }
  const url = entry.href;
  if (registered.get(name) !== url) {
    registerRemotes([{ name, entry: url, type: 'module' }], {
      force: registered.has(name),
    });
    registered.set(name, url);
  }
}

function assertPage<T extends { default: unknown }>(
  module: T | null,
  name: string,
): asserts module is T {
  if (
    !module ||
    !module.default ||
    !['function', 'object'].includes(typeof module.default)
  )
    throw new Error(`${name} was not returned by the remote`);
}

export async function loadPeoplePage(retry = false): Promise<RemotePageModule> {
  await registerConfiguredRemote('people', retry);
  const module = await loadRemote<{
    default: ComponentType<
      ShellRuntimeProps & { loadCapacity?: DeliveryCapacityLoader }
    >;
  }>('people/PeoplePage');
  assertPage(module, 'PeoplePage');
  const Page = module.default;
  return {
    default: function HostedPeoplePage({ runtimeContext }: ShellRuntimeProps) {
      return createElement(Page, {
        runtimeContext,
        loadCapacity: loadDeliveryCapacityCapability,
      });
    },
  };
}

let capabilityFailed = false;
export async function loadPlanningPeopleCapability(): Promise<PlanningPeopleCapability> {
  try {
    await registerConfiguredRemote('people', capabilityFailed);
    const capability = await loadRemote<PlanningPeopleCapability>(
      'people/PlanningRates',
    );
    if (
      !capability ||
      typeof capability.listPlanningPeople !== 'function' ||
      typeof capability.getPlanningPerson !== 'function'
    )
      throw new Error('People planning capability unavailable');
    capabilityFailed = false;
    return capability;
  } catch (error) {
    capabilityFailed = true;
    throw error;
  }
}

export async function loadDeliveryPage(
  retry = false,
): Promise<RemotePageModule> {
  await registerConfiguredRemote('delivery', retry);
  const module = await loadRemote<{
    default: ComponentType<
      ShellRuntimeProps & { loadPlanningPeople?: PlanningPeopleLoader }
    >;
  }>('delivery/DeliveryPage');
  assertPage(module, 'DeliveryPage');
  const Page = module.default;
  return {
    default: function HostedDeliveryPage({
      runtimeContext,
    }: ShellRuntimeProps) {
      return createElement(Page, {
        runtimeContext,
        loadPlanningPeople: loadPlanningPeopleCapability,
      });
    },
  };
}

let capacityFailed = false;
export async function loadDeliveryCapacityCapability(): Promise<DeliveryCapacityCapability> {
  try {
    await registerConfiguredRemote('delivery', capacityFailed);
    const capability =
      await loadRemote<DeliveryCapacityCapability>('delivery/Capacity');
    if (!capability || typeof capability.listCapacityStatuses !== 'function')
      throw new Error('Delivery capacity capability unavailable');
    capacityFailed = false;
    return capability;
  } catch (error) {
    capacityFailed = true;
    throw error;
  }
}
