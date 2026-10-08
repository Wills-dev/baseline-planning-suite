import type { AllocationUnit, CapacityStatus } from '@baseline/domain';
import { useId, useRef, useState } from 'react';

import {
  formatDisplayValue,
  formatInputValue,
} from '../application/display-values';

interface Props {
  value: number;
  capacityStatus?: CapacityStatus | undefined;
  latestEdit?: boolean;
  unit?: AllocationUnit;
  unavailable?: string | undefined;
  editUnavailable?: string | undefined;
  label: string;
  disabled: boolean;
  readOnly: boolean;
  onSave: (input: string) => Promise<boolean>;
}

export function AllocationCell({
  value,
  capacityStatus,
  latestEdit,
  unit = 'Hours',
  unavailable,
  editUnavailable,
  label,
  disabled,
  readOnly,
  onSave,
}: Props) {
  const warningId = useId();
  const overCapacity = capacityStatus?.overAllocated;
  // null means clean: display the current authoritative application value.
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef(false);
  async function commit() {
    if (
      draft === null ||
      pending.current ||
      disabled ||
      readOnly ||
      unavailable ||
      editUnavailable
    )
      return;
    pending.current = true;
    try {
      if (await onSave(draft)) setDraft(null);
    } finally {
      pending.current = false;
    }
  }
  return (
    <div
      className={
        overCapacity
          ? latestEdit
            ? 'delivery-capacity-latest'
            : 'delivery-capacity-warning'
          : undefined
      }
    >
      {unavailable ? (
        <span aria-label={`${label}: ${unavailable}`}>{unavailable}</span>
      ) : readOnly || editUnavailable ? (
        <output
          aria-label={label}
          aria-describedby={overCapacity ? warningId : undefined}
        >
          {formatDisplayValue(value, unit)}
        </output>
      ) : (
        <input
          type="number"
          min="0"
          step="any"
          value={draft ?? formatInputValue(value, unit)}
          disabled={disabled}
          aria-label={label}
          aria-describedby={`delivery-grid-help${overCapacity ? ` ${warningId}` : ''}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
            if (event.key === 'Escape') setDraft(null);
          }}
        />
      )}
      {editUnavailable && !unavailable && <span>{editUnavailable}</span>}
      {unit === 'Cost' && !readOnly && !unavailable && !editUnavailable && (
        <span className="delivery-cost-display">
          {formatDisplayValue(value, unit)}
        </span>
      )}
      {overCapacity && (
        <span id={warningId} className="delivery-capacity-description">
          Over capacity:{' '}
          {formatDisplayValue(capacityStatus.utilizationPercent, 'Percent')}%
          allocated across all projects.
          {latestEdit && <strong> Latest edit saved; capacity warning.</strong>}
        </span>
      )}
    </div>
  );
}
