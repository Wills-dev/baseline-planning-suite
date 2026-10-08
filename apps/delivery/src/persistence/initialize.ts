import { createDeliveryRepository } from './delivery-repository';

const repository = createDeliveryRepository();

export function initializeDeliveryPersistence(): Promise<void> {
  return repository.initialize();
}
