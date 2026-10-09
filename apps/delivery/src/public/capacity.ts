import { createDeliveryRepository } from '../persistence/delivery-repository';
import { createDeliveryCapacityCapability } from '../application/capacity-capability';
const capability = createDeliveryCapacityCapability(createDeliveryRepository());
export const listCapacityStatuses = capability.listCapacityStatuses;
