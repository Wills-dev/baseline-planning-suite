import { capacityKey } from '@baseline/domain';
import type { ProjectPlanningData } from '../application/delivery-service';
import { useMemo } from 'react';
import type { Allocation, BreakdownItem, YearMonth } from '@baseline/domain';
import type { PlanningPerson } from '../application/planning-people';
import type { EditableUnit } from '../application/allocation-values';
import { hoursToDisplay } from '../application/allocation-values';
import { descendantLeafIds, isLeaf, workItemPath } from '../application/wbs';
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
  const totals = useMemo(() => {
    const leaves = descendantLeafIds(selectedId, items);
    const cells = new Map<string, number>();
    for (const allocation of allocations) {
      if (!leaves.has(allocation.breakdownItemId)) continue;
      const key = capacityKey(allocation.employeeId, allocation.month);
      cells.set(key, (cells.get(key) ?? 0) + allocation.hours);
    }
    return cells;
  }, [selectedId, items, allocations]);
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
                    const hours =
                      totals.get(capacityKey(person.employeeId, month)) ?? 0;
                    const value = hoursToDisplay(hours, unit, person, month);
                    const key = capacityKey(person.employeeId, month);
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
                          capacityStatus={status}
                          latestEdit={latestEdit}
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
