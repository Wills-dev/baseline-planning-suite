import type { Allocation, BreakdownItem, Project } from '@baseline/domain';
import { createOfficialDeliveryFixtures } from '../../../../fixtures/official-seed';
export { planningMonths } from '../../../../fixtures/official-seed';
export interface DeliveryFixtures {
  projects: Project[];
  breakdownItems: BreakdownItem[];
  allocations: Allocation[];
}
export function createDeliveryFixtures(): DeliveryFixtures {
  const { projects, breakdownItems, allocations } =
    createOfficialDeliveryFixtures();
  return { projects, breakdownItems, allocations };
}
