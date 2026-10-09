import { capacityKey } from '@baseline/domain';
import type { ProjectPlanningData } from '../application/delivery-service';
import { useMemo } from 'react';
import type { Allocation, BreakdownItem, YearMonth } from '@baseline/domain';
import type { PlanningPerson } from '../application/planning-people';
import type { EditableUnit } from '../application/allocation-values';
import { priceCellHours } from '../application/allocation-values';
import { derivePlanningDisplay } from '../application/display-values';
import {
  buildWbsTree,
  isLeaf,
  workItemPath,
  rollupHours,
} from '../application/wbs';
import { AllocationCell } from './AllocationCell';

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
interface Props {
  selectedId: string;
  capacityStatuses: ProjectPlanningData['capacityStatuses'];
  latestCapacityEdits: ProjectPlanningData['latestCapacityEdits'];
  items: readonly BreakdownItem[];
  allocations: readonly Allocation[];
  people: readonly PlanningPerson[];
  planningMonths: readonly YearMonth[];
  unit: EditableUnit;
  disabled: boolean;
  onSave: (
    employeeId: string,
    month: YearMonth,
    input: string,
  ) => Promise<boolean>;
}

export function StaffingGrid({
  selectedId,
  capacityStatuses,
  latestCapacityEdits,
  items,
  allocations,
  people,
  planningMonths,
  unit,
  disabled,
  onSave,
}: Props) {
  const projectId = items.find((item) => item.id === selectedId)?.projectId;
  const leaf = isLeaf(selectedId, items);
  const path = workItemPath(selectedId, items);
  const displays = useMemo(() => {
    const tree = buildWbsTree(items);
    const result = new Map<string, number | null>();
    for (const person of people) {
      for (const month of planningMonths) {
        const values = derivePlanningDisplay(
          tree,
          allocations,
          person,
          month,
          unit,
        );
        result.set(
          capacityKey(person.employeeId, month),
          values.get(selectedId) ?? null,
        );
      }
    }
    return result;
  }, [selectedId, items, allocations, people, planningMonths, unit]);
  return (
    <section aria-labelledby="delivery-grid-heading">
      <h2 id="delivery-grid-heading">Staffing allocations</h2>
      <p>
        <strong>Selected work item:</strong> {path}
      </p>
      <p id="delivery-grid-help">
        {leaf
          ? 'Edit this leaf’s allocations. Press Enter or leave the cell to save; Escape cancels an unsaved edit. Enter zero to remove its record.'
          : 'Parent totals are derived from descendant leaves and are read-only.'}
      </p>
      <p>
        {people.length} planning people × {planningMonths.length} months (
        {planningMonths[0]}–{planningMonths.at(-1)}). Unit:{' '}
        {unit === 'Percent' ? '% capacity' : unit}.
      </p>
      {[...capacityStatuses.values()]
        .filter((status) => status.overAllocated)
        .map((status) => {
          const latest = latestCapacityEdits.get(
            capacityKey(status.employeeId, status.month),
          );
          return (
            <p
              key={capacityKey(status.employeeId, status.month)}
              className="delivery-capacity-description"
              role="status"
            >
              {people.find((person) => person.employeeId === status.employeeId)
                ?.name ?? status.employeeId}
              , {status.month}: over capacity across all projects.
              {latest
                ? ` Latest contributing assignment: ${latest.assignmentName}. Edit saved, not blocked.`
                : ' Historical edit order unavailable for existing allocations.'}
            </p>
          );
        })}
      {people.length === 0 ? (
        <p>No planning people are available.</p>
      ) : (
        <div className="delivery-grid-scroll">
          <table>
            <caption>Staffing for {path}</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {planningMonths.map((month) => (
                  <th scope="col" key={month}>
                    {monthNames[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.employeeId}>
                  <th scope="row">
                    {person.name}
                    <span className="delivery-person-hours">
                      {person.weeklyHours}h/week
                    </span>
                  </th>
                  {planningMonths.map((month) => {
                    const key = capacityKey(person.employeeId, month);
                    const priced =
                      unit === 'Cost'
                        ? priceCellHours(0, person, month)
                        : undefined;
                    const display = displays.get(key);
                    const unavailable =
                      priced?.costEUR === null || display === null;
                    const value = display ?? 0;
                    const status = capacityStatuses.get(key);
                    const latest = latestCapacityEdits.get(key);
                    const latestEdit =
                      latest?.breakdownItemId === selectedId &&
                      latest.projectId === projectId;
                    return (
                      <td key={month}>
                        <AllocationCell
                          key={JSON.stringify([
                            selectedId,
                            person.employeeId,
                            month,
                          ])}
                          value={value}
                          beforeFirstRate={
                            priced?.status === 'before-first-rate' &&
                            rollupHours(
                              selectedId,
                              items,
                              allocations.filter(
                                (allocation) =>
                                  allocation.employeeId === person.employeeId &&
                                  allocation.month === month,
                              ),
                            ) > 0
                          }
                          capacityStatus={status}
                          latestEdit={latestEdit}
                          unit={unit}
                          unavailable={
                            unavailable
                              ? priced?.unavailable ||
                                'Cost unavailable: no applicable rate.'
                              : undefined
                          }
                          editUnavailable={
                            unit === 'Cost' && !unavailable && !priced?.editable
                              ? priced?.unavailable
                              : undefined
                          }
                          label={`${person.name}, ${month}, ${path}, ${unit}`}
                          disabled={disabled}
                          readOnly={!leaf}
                          onSave={(input) =>
                            onSave(person.employeeId, month, input)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
