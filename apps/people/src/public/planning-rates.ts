import { createPeopleRepository } from '../persistence/people-repository';
import { createPlanningPeopleCapability } from '../application/planning-capability';

// The owner repository stays private behind this narrow public capability.
const capability = createPlanningPeopleCapability(createPeopleRepository());
export const listPlanningPeople = capability.listPlanningPeople;
export const getPlanningPerson = capability.getPlanningPerson;
