import { loadRemote, registerRemotes } from '@module-federation/runtime';
import type {
  PlanningPeopleCapability,
  PlanningPeopleLoader,
} from '@baseline/contracts';
import { createFixturePlanningPeopleProvider } from '../application/planning-people';
import type {
  PlanningPeopleProvider,
  PlanningPerson,
} from '../application/planning-people';

const unavailable =
  'Authoritative People data unavailable. Cost is unavailable; previously loaded schedules may be stale. Canonical hours are retained. Retry People data.';

/** Cache transport resolution, not authority: each get fetches a fresh owner snapshot. */
export function createCapabilityPlanningPeopleProvider(
  load: PlanningPeopleLoader,
): PlanningPeopleProvider {
  let capability: Promise<PlanningPeopleCapability> | undefined;
  let known: PlanningPerson[] = [];
  let status = 'Authoritative People data.';
  const resolve = () =>
    (capability ??= load().catch((error) => {
      capability = undefined;
      throw error;
    }));
  function failed(person: PlanningPerson): PlanningPerson {
    return { ...person, rates: [], rateDataError: unavailable };
  }
  return {
    listPeople: async () => {
      try {
        known = await (await resolve()).listPlanningPeople();
        status = 'Authoritative People data.';
      } catch {
        // Retain known schedules/identities; never fall back to bootstrap rates.
        known = known.map(failed);
        status = unavailable;
      }
      return known;
    },
    getPerson: async (employeeId) => {
      try {
        const person = await (await resolve()).getPlanningPerson(employeeId);
        known = known.filter((item) => item.employeeId !== employeeId);
        if (person) known.push(person);
        status = known.some((item) => item.rateDataError)
          ? unavailable
          : 'Authoritative People data.';
        return person;
      } catch {
        const previous = known.find((item) => item.employeeId === employeeId);
        const person = previous ? failed(previous) : undefined;
        if (person)
          known = known.map((item) =>
            item.employeeId === employeeId ? person : item,
          );
        status = unavailable;
        return person;
      }
    },
    getStatus: () => status,
  };
}

/** Standalone uses its origin's runtime config. Only explicit people:null enables bootstrap. */
export function createRuntimePlanningPeopleProvider(
  loader?: PlanningPeopleLoader,
): PlanningPeopleProvider {
  if (loader) return createCapabilityPlanningPeopleProvider(loader);
  let provider: Promise<PlanningPeopleProvider> | undefined;
  let current: PlanningPeopleProvider | undefined;
  async function configured(): Promise<PlanningPeopleProvider> {
    provider ??= (async () => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}remote-config.json`,
        { cache: 'no-store' },
      );
      if (!response.ok)
        throw new Error('Could not load People remote configuration');
      const config: unknown = await response.json();
      if (
        typeof config !== 'object' ||
        config === null ||
        !('people' in config)
      )
        throw new Error('Invalid People remote configuration');
      if (config.people === null) return createFixturePlanningPeopleProvider();
      if (typeof config.people !== 'string' || !config.people.trim())
        throw new Error('Invalid People remote location');
      const entry = config.people;
      return createCapabilityPlanningPeopleProvider(async () => {
        registerRemotes([{ name: 'people', entry, type: 'module' }]);
        const module = await loadRemote<PlanningPeopleCapability>(
          'people/PlanningRates',
        );
        if (
          !module ||
          typeof module.listPlanningPeople !== 'function' ||
          typeof module.getPlanningPerson !== 'function'
        )
          throw new Error('People planning capability unavailable');
        return module;
      });
    })().catch(() => {
      provider = undefined;
      // Configuration failure is an unavailable authority, not permission to invent rates.
      return createCapabilityPlanningPeopleProvider(async () => {
        throw new Error(unavailable);
      });
    });
    current = await provider;
    return current;
  }
  return {
    listPeople: async () => (await configured()).listPeople(),
    getPerson: async (id) => (await configured()).getPerson(id),
    getStatus: () => current?.getStatus?.() ?? 'Loading People data…',
  };
}
