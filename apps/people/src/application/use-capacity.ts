import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeDeliveryAllocationsChanged } from '@baseline/contracts';
import type {
  DeliveryCapacityLoader,
  PersonCapacitySnapshot,
} from '@baseline/contracts';
import type { Employee } from '@baseline/domain';

/** Only owner-provided derived status is retained; no allocation replication. */
export function useCapacity(
  employees: readonly Employee[],
  load?: DeliveryCapacityLoader,
) {
  const [statuses, setStatuses] = useState<readonly PersonCapacitySnapshot[]>(
    [],
  );
  const [message, setMessage] = useState('Capacity status loading…');
  const version = useRef({ value: 0 });
  const refresh = useCallback(async () => {
    const request = ++version.current.value;
    try {
      if (!load) throw new Error('No Delivery capacity authority configured');
      const result = await (
        await load()
      ).listCapacityStatuses(
        employees.map((employee) => ({
          employeeId: employee.id,
          weeklyHours: employee.weeklyHours,
        })),
      );
      if (
        result.length !== employees.length ||
        employees.some(
          (employee) =>
            !result.some((status) => status.employeeId === employee.id),
        )
      )
        throw new Error('Incomplete capacity status');
      if (request === version.current.value) {
        setStatuses(result);
        setMessage('');
      }
    } catch {
      if (request === version.current.value) {
        setStatuses([]);
        setMessage(
          'Capacity status unavailable. Employee and rate editing remain usable.',
        );
      }
    }
  }, [employees, load]);
  useEffect(() => {
    const counter = version.current;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return refresh();
    });
    const unsubscribe = subscribeDeliveryAllocationsChanged(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      ++counter.value;
      unsubscribe();
    };
  }, [refresh]);
  return { statuses, message, refresh };
}
