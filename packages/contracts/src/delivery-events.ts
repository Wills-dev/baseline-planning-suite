/** Delivery invalidates capacity after successful allocation persistence. */
export interface DeliveryAllocationsChangedEvent {
  type: 'delivery.allocationsChanged';
  payload: {
    employeeId: string;
  };
}

const allocationsChangedEvent: DeliveryAllocationsChangedEvent['type'] =
  'delivery.allocationsChanged';

function defaultEventTarget(): EventTarget | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

/** Document-scoped invalidation; no module-local shared mutable event bus. */
export function publishDeliveryAllocationsChanged(
  payload: DeliveryAllocationsChangedEvent['payload'],
  target: EventTarget | undefined = defaultEventTarget(),
): void {
  if (!target) return;
  target.dispatchEvent(
    new CustomEvent(allocationsChangedEvent, {
      detail: { employeeId: payload.employeeId },
    }),
  );
}

export function subscribeDeliveryAllocationsChanged(
  handler: (payload: DeliveryAllocationsChangedEvent['payload']) => void,
  target: EventTarget | undefined = defaultEventTarget(),
): () => void {
  if (!target) return () => undefined;
  const listener: EventListener = (event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'employeeId' in detail &&
      typeof detail.employeeId === 'string'
    ) {
      handler({ employeeId: detail.employeeId });
    }
  };
  target.addEventListener(allocationsChangedEvent, listener);
  return () => target.removeEventListener(allocationsChangedEvent, listener);
}
