// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import {
  publishPeopleRateChanged,
  subscribePeopleRateChanged,
} from './people-events';

test('document transport sends narrow invalidations and cleans up across remounts', () => {
  const handler = vi.fn();
  const off = subscribePeopleRateChanged(handler);
  publishPeopleRateChanged({ employeeId: 'e' });
  expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
  off();
  publishPeopleRateChanged({ employeeId: 'e' });
  expect(handler).toHaveBeenCalledTimes(1);
  const offAgain = subscribePeopleRateChanged(handler);
  publishPeopleRateChanged({ employeeId: 'other' });
  expect(handler).toHaveBeenCalledTimes(2);
  offAgain();
});

test('publish sends only the employee id to an explicit event target', () => {
  const target = new EventTarget();
  const listener = vi.fn((event: Event) => {
    expect((event as CustomEvent<unknown>).detail).toEqual({ employeeId: 'e' });
  });
  target.addEventListener('people.rateChanged', listener);
  const payload = { employeeId: 'e', extra: 'excluded' };
  publishPeopleRateChanged(payload, target);
  expect(listener).toHaveBeenCalledTimes(1);
});

test('subscribe uses an explicit event target and unsubscribe removes its listener', () => {
  const target = new EventTarget();
  const handler = vi.fn();
  const off = subscribePeopleRateChanged(handler, target);
  publishPeopleRateChanged({ employeeId: 'e' }, target);
  expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
  off();
  off();
  publishPeopleRateChanged({ employeeId: 'other' }, target);
  expect(handler).toHaveBeenCalledTimes(1);
});

test('malformed invalidation payloads are ignored', () => {
  const target = new EventTarget();
  const handler = vi.fn();
  const off = subscribePeopleRateChanged(handler, target);
  for (const detail of [undefined, null, 'e', {}, { employeeId: 1 }]) {
    target.dispatchEvent(new CustomEvent('people.rateChanged', { detail }));
  }
  expect(handler).not.toHaveBeenCalled();
  off();
});

test('missing default document is harmless and explicit targets still work', () => {
  vi.stubGlobal('document', undefined);
  try {
    const handler = vi.fn();
    const off = subscribePeopleRateChanged(handler);
    expect(() => publishPeopleRateChanged({ employeeId: 'e' })).not.toThrow();
    expect(() => off()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();

    const target = new EventTarget();
    const offExplicit = subscribePeopleRateChanged(handler, target);
    publishPeopleRateChanged({ employeeId: 'e' }, target);
    expect(handler).toHaveBeenCalledExactlyOnceWith({ employeeId: 'e' });
    offExplicit();
  } finally {
    vi.unstubAllGlobals();
  }
});
