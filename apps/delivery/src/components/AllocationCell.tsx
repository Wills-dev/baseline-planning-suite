import type { CapacityStatus } from '@baseline/domain';
import { useId, useRef, useState } from 'react';

const displayNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });

interface Props {
  value: number;
  capacityStatus?: CapacityStatus | undefined;
  latestEdit?: boolean;
  label: string;
  disabled: boolean;
  readOnly: boolean;
  onSave: (input: string) => Promise<boolean>;
}

export function AllocationCell({
  value,
  capacityStatus,
  latestEdit,
  label,
  disabled,
  readOnly,
  onSave,
}: Props) {
  const warningId = useId();
  const overCapacity = capacityStatus?.overAllocated;
  // null means no local edit: always display the latest authoritative value.
  const [draft, setDraft] = useState<string | null>(null);
  const dirty = draft !== null;
  const pending = useRef(false);
  async function commit() {
    if (!dirty || pending.current || disabled || readOnly) return;
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
      {readOnly ? (
        <output
          aria-label={label}
          aria-describedby={overCapacity ? warningId : undefined}
        >
          {displayNumber.format(value)}
        </output>
      ) : (
        <input
          type="number"
          min="0"
          step="any"
          value={draft ?? String(value)}
          disabled={disabled}
          aria-label={label}
          aria-describedby={`delivery-grid-help${overCapacity ? ` ${warningId}` : ''}`}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
            if (event.key === 'Escape') {
              setDraft(null);
            }
          }}
        />
      )}
      {overCapacity && (
        <span id={warningId} className="delivery-capacity-description">
          Over capacity:{' '}
          {displayNumber.format(capacityStatus.utilizationPercent)}% allocated
          across all projects.
          {latestEdit && <strong> Latest edit saved; capacity warning.</strong>}
        </span>
      )}
    </div>
  );
}
