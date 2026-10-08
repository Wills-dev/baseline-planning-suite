import { useEffect, useRef, useState } from 'react';
import type { Employee, RateRecord } from '@baseline/domain';
import { createPeopleRepository } from '../persistence/people-repository';
import { createPeopleService, RateInputError } from './people-service';
import type { RateInput } from './people-service';

export function usePeople() {
  const [service] = useState(() =>
    createPeopleService(createPeopleRepository()),
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeError, setEmployeeError] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [rates, setRates] = useState<RateRecord[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const selectionRequest = useRef(0);
  const mutationPending = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    service
      .listEmployees()
      .then((items) => {
        if (!cancelled) {
          setEmployees(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployeeError(
            'Unable to load employees. Check that browser storage is available, then retry.',
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [service]);

  async function reloadEmployees() {
    setLoading(true);
    setEmployeeError('');
    try {
      const items = await service.listEmployees();
      if (active.current) setEmployees(items);
    } catch {
      if (active.current)
        setEmployeeError(
          'Unable to load employees. Check that browser storage is available, then retry.',
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }

  async function selectEmployee(employee: Employee) {
    if (mutationPending.current) return;
    const request = ++selectionRequest.current;
    setSelected(employee);
    setRates([]);
    setRateLoading(true);
    setRateError('');
    setMutationError('');
    setNotice('');
    try {
      const history = await service.listRateHistory(employee.id);
      if (active.current && request === selectionRequest.current)
        setRates(history);
    } catch {
      if (active.current && request === selectionRequest.current)
        setRateError('Unable to load this employee’s rates. Please retry.');
    } finally {
      if (active.current && request === selectionRequest.current)
        setRateLoading(false);
    }
  }

  async function mutate(
    operation: () => Promise<RateRecord[]>,
    success: string,
  ): Promise<boolean> {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setBusy(true);
    setMutationError('');
    setNotice('');
    try {
      const history = await operation();
      if (active.current) {
        setRates(history);
        setNotice(success);
      }
      return true;
    } catch (error) {
      if (active.current)
        setMutationError(
          error instanceof RateInputError
            ? error.message
            : 'Unable to complete the change. It may have been saved; reload the rate history before retrying.',
        );
      return false;
    } finally {
      mutationPending.current = false;
      if (active.current) setBusy(false);
    }
  }

  return {
    employees,
    loading,
    employeeError,
    reloadEmployees,
    selected,
    rates,
    rateLoading,
    rateError,
    mutationError,
    notice,
    busy,
    selectEmployee,
    saveRate: (input: RateInput, editingId?: string) =>
      selected
        ? mutate(
            () => service.saveRate(selected.id, input, editingId),
            'Rate saved.',
          )
        : Promise.resolve(false),
    deleteRate: (id: string) =>
      selected
        ? mutate(() => service.deleteRate(selected.id, id), 'Rate deleted.')
        : Promise.resolve(false),
  };
}
