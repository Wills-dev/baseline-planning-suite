import { useState } from 'react';
import type { YearMonth } from '@baseline/domain';
import type {
  ProjectPlanningData,
  WorkItemInput,
} from '../application/delivery-service';
import type { PlanningPerson } from '../application/planning-people';
import type { EditableUnit } from '../application/allocation-values';
import { WbsTree } from './WbsTree';
import { WbsEditor } from './WbsEditor';
import { StaffingGrid } from './StaffingGrid';
import { UnitSelector } from './UnitSelector';

interface Props {
  data: ProjectPlanningData;
  people: readonly PlanningPerson[];
  planningMonths: readonly YearMonth[];
  busy: boolean;
  onSaveWorkItem: (input: WorkItemInput, id?: string) => Promise<boolean>;
  onDeleteWorkItem: (id: string) => Promise<boolean>;
  onSaveCell: (
    leafId: string,
    employeeId: string,
    month: YearMonth,
    input: string,
    unit: EditableUnit,
  ) => Promise<boolean>;
}

export function ProjectPlanningPanel({
  data,
  people,
  planningMonths,
  busy,
  onSaveWorkItem,
  onDeleteWorkItem,
  onSaveCell,
}: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [unit, setUnit] = useState<EditableUnit>('Hours');
  const selected = data.items.find((item) => item.id === selectedId);
  return (
    <div className="delivery-layout">
      <aside>
        <WbsTree
          items={data.items}
          planningMonths={planningMonths}
          allocations={data.allocations}
          selectedId={selectedId}
          disabled={busy}
          onSelect={setSelectedId}
        />
        <WbsEditor
          key={selectedId}
          items={data.items}
          selected={selected}
          busy={busy}
          onSave={onSaveWorkItem}
          onDelete={async (id) => {
            const deleted = await onDeleteWorkItem(id);
            if (deleted) setSelectedId('');
            return deleted;
          }}
        />
      </aside>
      <div className="delivery-staffing-panel">
        <p className="delivery-planning-note">
          Temporary fixture planning people provide names and weekly hours.
          Authoritative People data will be connected in Step 10.
        </p>
        <UnitSelector unit={unit} disabled={busy} onChange={setUnit} />
        {selected ? (
          <StaffingGrid
            selectedId={selectedId}
            items={data.items}
            allocations={data.allocations}
            people={people}
            planningMonths={planningMonths}
            unit={unit}
            disabled={busy}
            onSave={(employeeId, month, input) =>
              onSaveCell(selectedId, employeeId, month, input, unit)
            }
          />
        ) : (
          <p>
            Select a work item to view its staffing or derived parent totals.
          </p>
        )}
      </div>
    </div>
  );
}
