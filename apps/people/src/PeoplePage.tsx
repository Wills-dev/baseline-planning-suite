import { useCapacity } from './application/use-capacity';
import type {
  ShellRuntimeProps,
  DeliveryCapacityLoader,
} from '@baseline/contracts';
import { useState } from 'react';
import type { RateRecord } from '@baseline/domain';
import { searchEmployees } from './application/people-service';
import { usePeople } from './application/use-people';
import { EmployeeRegister } from './components/EmployeeRegister';
import { EmployeeDetails } from './components/EmployeeDetails';
import { RateHistory } from './components/RateHistory';
import { RateEditor } from './components/RateEditor';
import './people.css';

export default function PeoplePage({
  runtimeContext,
  loadCapacity,
}: ShellRuntimeProps & { loadCapacity?: DeliveryCapacityLoader }) {
  const people = usePeople();
  const capacity = useCapacity(people.employees, loadCapacity);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<RateRecord | null>(null);
  return (
    <div className="people-page">
      <header>
        <h1>Baseline Planning — People</h1>
        <p>Employees and effective-dated hourly cost rates.</p>
        <p>
          Active user: {runtimeContext.activeUser.name} · Display currency:{' '}
          {runtimeContext.displayCurrency}.
        </p>
        {runtimeContext.displayCurrency !== 'EUR' && (
          <p>
            Amounts remain in EUR; no exchange-rate conversion is configured.
          </p>
        )}
      </header>
      {people.loading ? (
        <p role="status">Loading employees…</p>
      ) : people.employeeError ? (
        <div>
          <p role="alert" className="people-error">
            {people.employeeError}
          </p>
          <button type="button" onClick={() => void people.reloadEmployees()}>
            Retry loading employees
          </button>
        </div>
      ) : people.employees.length === 0 ? (
        <p>No employees are available.</p>
      ) : (
        <div className="people-layout">
          <EmployeeRegister
            capacityStatuses={capacity.statuses}
            capacityMessage={capacity.message}
            onRetryCapacity={() => void capacity.refresh()}
            employees={searchEmployees(people.employees, query)}
            query={query}
            onQueryChange={setQuery}
            selectedId={people.selected?.id}
            disabled={people.busy}
            onSelect={(employee) => {
              setEditing(null);
              void people.selectEmployee(employee);
            }}
          />
          <section
            aria-labelledby={
              people.selected ? 'employee-details-heading' : undefined
            }
            className="people-detail-panel"
          >
            {!people.selected ? (
              <p>Select an employee to view details and rate history.</p>
            ) : (
              <>
                <EmployeeDetails employee={people.selected} />
                {people.rateLoading ? (
                  <p role="status">Loading rate history…</p>
                ) : people.rateError ? (
                  <div>
                    <p role="alert" className="people-error">
                      {people.rateError}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (people.selected)
                          void people.selectEmployee(people.selected);
                      }}
                    >
                      Retry loading rates
                    </button>
                  </div>
                ) : (
                  <>
                    <RateHistory
                      rates={people.rates}
                      disabled={people.busy}
                      onEdit={setEditing}
                      onDelete={(rate) => {
                        if (
                          window.confirm(
                            `Delete the rate starting ${rate.validFrom} for ${people.selected?.name}?`,
                          )
                        ) {
                          void people.deleteRate(rate.id).then((deleted) => {
                            if (deleted && editing?.id === rate.id)
                              setEditing(null);
                          });
                        }
                      }}
                    />
                    <p role="status">{people.notice}</p>
                    {people.mutationError && (
                      <button
                        type="button"
                        disabled={people.busy}
                        onClick={() => {
                          setEditing(null);
                          if (people.selected)
                            void people.selectEmployee(people.selected);
                        }}
                      >
                        Reload rate history
                      </button>
                    )}
                    <RateEditor
                      key={`${people.selected.id}:${editing?.id ?? 'new'}`}
                      editing={editing}
                      busy={people.busy}
                      error={people.mutationError}
                      onSave={people.saveRate}
                      onCancel={() => setEditing(null)}
                    />
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
