import { createPeopleRepository } from './people-repository';

const repository = createPeopleRepository();

export function initializePeoplePersistence(): Promise<void> {
  return repository.initialize();
}
