import { useState } from 'react';
import type { RateRecord } from '@baseline/domain';
import type { RateInput } from '../application/people-service';

interface Props {
  editing: RateRecord | null;
  busy: boolean;
  error: string;
  onSave: (input: RateInput, editingId?: string) => Promise<boolean>;
  onCancel: () => void;
}

export function RateEditor({ editing, busy, error, onSave, onCancel }: Props) {
  const [validFrom, setValidFrom] = useState(editing?.validFrom ?? '');
  const [hourlyCostEUR, setHourlyCostEUR] = useState(
    editing ? String(editing.hourlyCostEUR) : '',
  );
  return (
    <section aria-labelledby="rate-editor-heading" className="people-editor">
      <h3 id="rate-editor-heading">{editing ? 'Edit rate' : 'Add rate'}</h3>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ validFrom, hourlyCostEUR }, editing?.id).then(
            (saved) => {
              if (saved) {
                setValidFrom('');
                setHourlyCostEUR('');
                onCancel();
              }
            },
          );
        }}
      >
        <fieldset disabled={busy}>
          <legend className="people-visually-hidden">
            {editing
              ? 'Update effective-dated rate'
              : 'New effective-dated rate'}
          </legend>
          <label htmlFor="rate-date">Effective from</label>
          <input
            id="rate-date"
            type="date"
            required
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
          <label htmlFor="rate-cost">Hourly rate (EUR)</label>
          <input
            id="rate-cost"
            type="number"
            min="0"
            step="any"
            required
            value={hourlyCostEUR}
            onChange={(event) => setHourlyCostEUR(event.target.value)}
          />
          {error && (
            <p role="alert" className="people-error">
              {error}
            </p>
          )}
          <div className="people-actions">
            <button type="submit">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add rate'}
            </button>
            {editing && (
              <button type="button" onClick={onCancel}>
                Cancel edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
