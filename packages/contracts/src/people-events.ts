/** People invalidates an employee's authoritative rate history after it changes.
 * Consumers should obtain the latest rate data before recalculating affected views.
 */
export interface PeopleRateChangedEvent {
  type: 'people.rateChanged';
  payload: {
    employeeId: string;
  };
}

const rateChangedEvent: PeopleRateChangedEvent['type'] = 'people.rateChanged';

function defaultEventTarget(): EventTarget | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

/** Document-scoped invalidation; no module-local shared mutable event bus. */
export function publishPeopleRateChanged(
  payload: PeopleRateChangedEvent['payload'],
  target: EventTarget | undefined = defaultEventTarget(),
): void {
  if (!target) return;
  target.dispatchEvent(
    new CustomEvent(rateChangedEvent, {
      detail: { employeeId: payload.employeeId },
    }),
  );
}

export function subscribePeopleRateChanged(
  handler: (payload: PeopleRateChangedEvent['payload']) => void,
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
  target.addEventListener(rateChangedEvent, listener);
  return () => target.removeEventListener(rateChangedEvent, listener);
}
