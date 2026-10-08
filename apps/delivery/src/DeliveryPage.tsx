import type { PlanningPeopleLoader } from '@baseline/contracts';
import { useDelivery } from './application/use-delivery';
import { ProjectSelector } from './components/ProjectSelector';
import { ProjectPlanningPanel } from './components/ProjectPlanningPanel';
import './delivery.css';

export default function DeliveryPage({
  loadPlanningPeople,
}: {
  loadPlanningPeople?: PlanningPeopleLoader;
}) {
  const planning = useDelivery(loadPlanningPeople);
  return (
    <div className="delivery-page">
      <header>
        <h1>Baseline Planning — Delivery</h1>
        <p>Project work breakdown and canonical-hour staffing plans.</p>
      </header>
      {planning.peopleStatus && (
        <p
          role={
            planning.peopleStatus.includes('unavailable') ? 'alert' : undefined
          }
        >
          {planning.peopleStatus}
        </p>
      )}
      {planning.peopleStatus.includes('unavailable') && (
        <button type="button" onClick={() => void planning.retryPeople()}>
          Retry People data
        </button>
      )}
      {planning.initialLoading ? (
        <p role="status">Loading planning data…</p>
      ) : planning.initialError ? (
        <>
          <p role="alert">{planning.initialError}</p>
          <button
            type="button"
            onClick={() => void planning.retryInitialization()}
          >
            Retry planning data
          </button>
        </>
      ) : planning.projects.length === 0 ? (
        <p>No projects are available.</p>
      ) : (
        <>
          <ProjectSelector
            projects={planning.projects}
            value={planning.projectId}
            disabled={planning.busy}
            onChange={(id) => void planning.selectProject(id)}
          />
          {planning.projectLoading ? (
            <p role="status">Loading project…</p>
          ) : planning.projectError ? (
            <>
              <p role="alert">{planning.projectError}</p>
              <button
                type="button"
                onClick={() => void planning.selectProject(planning.projectId)}
              >
                Retry project
              </button>
            </>
          ) : planning.data ? (
            <>
              {planning.mutationError && (
                <div className="delivery-error">
                  <p role="alert">{planning.mutationError}</p>
                  <button
                    type="button"
                    disabled={planning.busy}
                    onClick={() =>
                      void planning.selectProject(planning.projectId)
                    }
                  >
                    Reload project
                  </button>
                </div>
              )}
              <p role="status">
                {planning.busy ? 'Saving planning change…' : planning.notice}
              </p>
              <ProjectPlanningPanel
                key={planning.projectId}
                data={planning.data}
                people={planning.people}
                planningMonths={planning.planningMonths}
                busy={planning.busy}
                onSaveWorkItem={planning.saveWorkItem}
                onDeleteWorkItem={planning.deleteWorkItem}
                onSaveCell={planning.saveCell}
              />
            </>
          ) : (
            <p>Select a project to start planning.</p>
          )}
        </>
      )}
    </div>
  );
}
