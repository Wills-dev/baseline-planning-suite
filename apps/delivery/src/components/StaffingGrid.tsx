import { capacityKey } from '@baseline/domain';
import type { ProjectPlanningData } from '../application/delivery-service';
import { useMemo } from 'react';
import type { Allocation, BreakdownItem, YearMonth } from '@baseline/domain';
import type { PlanningPerson } from '../application/planning-people';
import type { EditableUnit } from '../application/allocation-values';
import {
  priceCellHours,
  hoursToDisplay,
} from '../application/allocation-values';
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
  const prices = useMemo(() => {
    if (unit !== 'Cost') return new Map<string, number | null>();
    const leaves = descendantLeafIds(selectedId, items);
    const byPerson = new Map(
      people.map((person) => [person.employeeId, person]),
    );
    const result = new Map<string, number | null>();
    // Price each descendant allocation, then sum: never store or price a parent record.
    for (const allocation of allocations) {
      if (!leaves.has(allocation.breakdownItemId)) continue;
      const person = byPerson.get(allocation.employeeId);
      if (!person) continue;
      const key = capacityKey(person.employeeId, allocation.month);
      const priced = priceCellHours(allocation.hours, person, allocation.month);
      const existing = result.get(key);
      result.set(
        key,
        existing === null || priced.costEUR === null
          ? null
          : (existing ?? 0) + priced.costEUR,
      );
    }
    return result;
  }, [selectedId, items, allocations, people, unit]);
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
                    const key = capacityKey(person.employeeId, month);
                    const priced =
                      unit === 'Cost'
                        ? priceCellHours(0, person, month)
                        : undefined;
                    const cost = prices.get(key);
                    const unavailable =
                      priced?.costEUR === null || cost === null;
                    const value =
                      unit === 'Cost'
                        ? (cost ?? 0)
                        : hoursToDisplay(hours, unit, person, month);
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
                          monetary={unit === 'Cost'}
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
