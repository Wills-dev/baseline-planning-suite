import { useRef, useState } from 'react';

const displayNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });

interface Props {
  value: number;
  label: string;
  disabled: boolean;
  readOnly: boolean;
  onSave: (input: string) => Promise<boolean>;
}

export function AllocationCell({
  value,
  label,
  disabled,
  readOnly,
  onSave,
}: Props) {
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
  if (readOnly)
    return <output aria-label={label}>{displayNumber.format(value)}</output>;
  return (
    <input
      type="number"
      min="0"
      step="any"
      value={draft ?? String(value)}
      disabled={disabled}
      aria-label={label}
      aria-describedby="delivery-grid-help"
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
  );
}
