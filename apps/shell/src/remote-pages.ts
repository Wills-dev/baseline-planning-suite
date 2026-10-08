import { createElement } from 'react';
import type { ComponentType } from 'react';
import type {
  PlanningPeopleCapability,
  PlanningPeopleLoader,
} from '@baseline/contracts';
import { loadRemote, registerRemotes } from '@module-federation/runtime';

interface RemotePageModule {
  default: ComponentType;
}

interface RemoteLocations {
  people: string;
  delivery: string;
}

function isRemoteLocations(value: unknown): value is RemoteLocations {
  return (
    typeof value === 'object' &&
    value !== null &&
    'people' in value &&
    typeof value.people === 'string' &&
    'delivery' in value &&
    typeof value.delivery === 'string'
  );
}

let registration: Promise<void> | undefined;

function registerConfiguredRemotes(): Promise<void> {
  registration ??= fetch(`${import.meta.env.BASE_URL}remote-config.json`, {
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok) throw new Error('Could not load remote configuration');
    const config: unknown = await response.json();
    if (!isRemoteLocations(config))
      throw new Error('Invalid remote configuration');
    registerRemotes([
      { name: 'people', entry: config.people, type: 'module' },
      { name: 'delivery', entry: config.delivery, type: 'module' },
    ]);
  });
  return registration;
}

export async function loadPeoplePage(): Promise<RemotePageModule> {
  await registerConfiguredRemotes();
  const module = await loadRemote<RemotePageModule>('people/PeoplePage');
  if (!module) throw new Error('PeoplePage was not returned by the remote');
  return module;
}

export async function loadPlanningPeopleCapability(): Promise<PlanningPeopleCapability> {
  await registerConfiguredRemotes();
  const capability = await loadRemote<PlanningPeopleCapability>(
    'people/PlanningRates',
  );
  if (
    !capability ||
    typeof capability.listPlanningPeople !== 'function' ||
    typeof capability.getPlanningPerson !== 'function'
  )
    throw new Error('People planning capability unavailable');
  return capability;
}

export async function loadDeliveryPage(): Promise<RemotePageModule> {
  await registerConfiguredRemotes();
  const module = await loadRemote<{
    default: ComponentType<{ loadPlanningPeople?: PlanningPeopleLoader }>;
  }>('delivery/DeliveryPage');
  if (!module) throw new Error('DeliveryPage was not returned by the remote');
  const Page = module.default;
  return {
    default: function HostedDeliveryPage() {
      return createElement(Page, {
        loadPlanningPeople: loadPlanningPeopleCapability,
      });
    },
  };
}
