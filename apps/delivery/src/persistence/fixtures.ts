import type { Allocation, BreakdownItem, Project } from '@baseline/domain';
import { createOfficialFixtures } from '../../../../fixtures/official-seed';
export { planningMonths } from '../../../../fixtures/official-seed';
export interface DeliveryFixtures {
  projects: Project[];
  breakdownItems: BreakdownItem[];
  allocations: Allocation[];
}
export function createDeliveryFixtures(): DeliveryFixtures {
  const { projects, breakdownItems, allocations } = createOfficialFixtures();
  return { projects, breakdownItems, allocations };
}
