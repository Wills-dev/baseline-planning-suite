import { calculateCapacityStatuses } from '@baseline/domain';
import type { Allocation, YearMonth } from '@baseline/domain';
import type {
  CapacityPerson,
  DeliveryCapacityCapability,
} from '@baseline/contracts';
import type { DeliveryRepository } from '../persistence/delivery-repository';
import { bootstrapPlanningConfiguration } from './planning-config';

export function calculatePlanCapacity(
  people: readonly CapacityPerson[],
  months: readonly YearMonth[],
  allocations: readonly Allocation[],
) {
  return calculateCapacityStatuses(
    people,
    [...new Set([...months, ...allocations.map((item) => item.month)])].sort(),
    allocations,
  );
}
export function createDeliveryCapacityCapability(
  repository: DeliveryRepository,
): DeliveryCapacityCapability {
  return {
    listCapacityStatuses: async (people) => {
      await repository.initialize();
      const statuses = calculatePlanCapacity(
        people,
        bootstrapPlanningConfiguration.planningMonths,
        await repository.listAllocations(),
      );
      return people.map((person) => ({
        employeeId: person.employeeId,
        oversubscribedMonths: [...statuses.values()]
          .filter(
            (status) =>
              status.employeeId === person.employeeId && status.overAllocated,
          )
          .map((status) => status.month),
      }));
    },
  };
}
