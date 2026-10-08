import { useEffect, useRef, useState } from 'react';
import type { Project, YearMonth } from '@baseline/domain';
import { createDeliveryRepository } from '../persistence/delivery-repository';
import { createDeliveryService } from './delivery-service';
import type { ProjectPlanningData, WorkItemInput } from './delivery-service';
import { createFixturePlanningPeopleProvider } from './planning-people';
import type { PlanningPerson } from './planning-people';
import type { EditableUnit } from './allocation-values';
import { PlanningInputError } from './planning-error';
import { createLatestProjectRequest } from './latest-project-request';

export function useDelivery() {
  const [service] = useState(() =>
    createDeliveryService(
      createDeliveryRepository(),
      createFixturePlanningPeopleProvider(),
    ),
  );
  const [requests] = useState(createLatestProjectRequest);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<PlanningPerson[]>([]);
  const [planningMonths, setPlanningMonths] = useState<readonly YearMonth[]>(
    [],
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<ProjectPlanningData | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    service
      .initialize()
      .then((result) => {
        if (!cancelled) {
          setProjects(result.projects);
          setPeople(result.people);
          setPlanningMonths(result.planningMonths);
          setInitialLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInitialError(
            'Unable to load planning data. Check browser storage and retry.',
          );
          setInitialLoading(false);
        }
      });
    return () => {
      cancelled = true;
      active.current = false;
      requests.cancel();
    };
  }, [service, requests]);

  async function retryInitialization() {
    setInitialLoading(true);
    setInitialError('');
    try {
      const result = await service.initialize();
      if (active.current) {
        setProjects(result.projects);
        setPeople(result.people);
        setPlanningMonths(result.planningMonths);
      }
    } catch {
      if (active.current)
        setInitialError(
          'Unable to load planning data. Check browser storage and retry.',
        );
    } finally {
      if (active.current) setInitialLoading(false);
    }
  }

  async function selectProject(id: string) {
    if (pending.current) return;
    const request = requests.next();
    setProjectId(id);
    setData(null);
    setProjectError('');
    setMutationError('');
    setNotice('');
    setProjectLoading(Boolean(id));
    if (!id) return;
    try {
      const result = await service.loadProject(id);
      if (active.current && requests.isCurrent(request)) setData(result);
    } catch (error) {
      if (active.current && requests.isCurrent(request))
        setProjectError(
          error instanceof PlanningInputError
            ? error.message
            : 'Unable to load this project. Please retry.',
        );
    } finally {
      if (active.current && requests.isCurrent(request))
        setProjectLoading(false);
    }
  }

  async function mutate(
    operation: () => Promise<ProjectPlanningData>,
    success: string,
  ): Promise<boolean> {
    if (pending.current || !data) return false;
    const request = requests.next();
    pending.current = true;
    setBusy(true);
    setMutationError('');
    setNotice('');
    try {
      const result = await operation();
      if (active.current && requests.isCurrent(request)) {
        setData(result);
        setNotice(success);
      }
      return true;
    } catch (error) {
      if (active.current && requests.isCurrent(request))
        setMutationError(
          error instanceof PlanningInputError
            ? error.message
            : 'Unable to complete the change. It may have been saved; reload the project before retrying.',
        );
      return false;
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  return {
    projects,
    people,
    planningMonths,
    initialLoading,
    initialError,
    retryInitialization,
    projectId,
    data,
    projectLoading,
    projectError,
    selectProject,
    busy,
    mutationError,
    notice,
    saveWorkItem: (input: WorkItemInput, id?: string) =>
      mutate(
        () => service.saveWorkItem(projectId, input, id),
        'Work item saved.',
      ),
    deleteWorkItem: (id: string) =>
      mutate(() => service.deleteWorkItem(projectId, id), 'Work item deleted.'),
    saveCell: (
      leafId: string,
      employeeId: string,
      month: YearMonth,
      input: string,
      unit: EditableUnit,
    ) =>
      mutate(
        () =>
          service.saveCell(projectId, leafId, employeeId, month, input, unit),
        'Allocation saved.',
      ),
  };
}
