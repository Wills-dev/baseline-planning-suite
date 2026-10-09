// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import {
  publishDeliveryAllocationsChanged,
  subscribeDeliveryAllocationsChanged,
} from './delivery-events';

test('document transport sends narrow invalidations and cleans up across remounts', () => {
  const handler = vi.fn();
  const off = subscribeDeliveryAllocationsChanged(handler);
  publishDeliveryAllocationsChanged({ employeeId: 'e' });
  expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
  off();
  publishDeliveryAllocationsChanged({ employeeId: 'e' });
  expect(handler).toHaveBeenCalledTimes(1);
  const offAgain = subscribeDeliveryAllocationsChanged(handler);
  publishDeliveryAllocationsChanged({ employeeId: 'other' });
  expect(handler).toHaveBeenCalledTimes(2);
  offAgain();
});

test('publish sends only the employee id to an explicit event target', () => {
  const target = new EventTarget();
  const listener = vi.fn((event: Event) => {
    expect((event as CustomEvent<unknown>).detail).toEqual({ employeeId: 'e' });
  });
  target.addEventListener('delivery.allocationsChanged', listener);
  const payload = { employeeId: 'e', extra: 'excluded' };
  publishDeliveryAllocationsChanged(payload, target);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('subscribe uses an explicit event target and unsubscribe removes its listener', () => {
  const target = new EventTarget();
  const handler = vi.fn();
  const off = subscribeDeliveryAllocationsChanged(handler, target);
  publishDeliveryAllocationsChanged({ employeeId: 'e' }, target);
  expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
  off();
  off();
  publishDeliveryAllocationsChanged({ employeeId: 'other' }, target);
  expect(handler).toHaveBeenCalledTimes(1);
});

test('malformed invalidation payloads are ignored', () => {
  const target = new EventTarget();
  const handler = vi.fn();
  const off = subscribeDeliveryAllocationsChanged(handler, target);
  for (const detail of [undefined, null, 'e', {}, { employeeId: 1 }]) {
    target.dispatchEvent(
      new CustomEvent('delivery.allocationsChanged', { detail }),
    );
  }
  expect(handler).not.toHaveBeenCalled();
  off();
});

test('missing default document is harmless and explicit targets still work', () => {
  vi.stubGlobal('document', undefined);
  try {
    const handler = vi.fn();
    const off = subscribeDeliveryAllocationsChanged(handler);
    expect(() =>
      publishDeliveryAllocationsChanged({ employeeId: 'e' }),
    ).not.toThrow();
    expect(() => off()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();

    const target = new EventTarget();
    const offExplicit = subscribeDeliveryAllocationsChanged(handler, target);
    publishDeliveryAllocationsChanged({ employeeId: 'e' }, target);
    expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
    offExplicit();
  } finally {
    vi.unstubAllGlobals();
  }
});
