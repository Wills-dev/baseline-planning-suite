import type { Allocation, BreakdownItem, YearMonth } from '@baseline/domain';
import { buildWbsTree, workItemPath } from '../application/wbs';
import type { WbsNode } from '../application/wbs';

import {
  deriveWbsHoursDisplay,
  formatDisplayValue,
} from '../application/display-values';
interface Props {
  items: readonly BreakdownItem[];
  planningMonths: readonly YearMonth[];
  allocations: readonly Allocation[];
  selectedId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}

export function WbsTree({
  items,
  planningMonths,
  allocations,
  selectedId,
  disabled,
  onSelect,
}: Props) {
  const horizonAllocations = allocations.filter((allocation) =>
    planningMonths.includes(allocation.month),
  );
  const displayedHours = deriveWbsHoursDisplay(items, horizonAllocations);
  const renderNodes = (nodes: readonly WbsNode[]) => (
    <ul>
      {nodes.map(({ item, children }) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={selectedId === item.id}
            aria-label={`Select ${item.type}: ${workItemPath(item.id, items)}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="delivery-item-type">{item.type}</span>
            <span>{item.name}</span>
            <span className="delivery-item-total">
              {formatDisplayValue(displayedHours.get(item.id) ?? 0, 'Hours')} h
            </span>
          </button>
          {children.length > 0 && renderNodes(children)}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="delivery-wbs-heading" className="delivery-wbs">
      <h2 id="delivery-wbs-heading">Work breakdown</h2>
      <p>
        Totals are derived across {planningMonths[0]}–{planningMonths.at(-1)}.
      </p>
      {items.length === 0 ? (
        <p>No work items yet. Create a Deliverable to start.</p>
      ) : (
        renderNodes(buildWbsTree(items))
      )}
    </section>
  );
}
