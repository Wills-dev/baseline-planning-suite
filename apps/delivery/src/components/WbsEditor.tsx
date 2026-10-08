import { useState } from 'react';
import type { BreakdownItem, BreakdownItemType } from '@baseline/domain';
import type { WorkItemInput } from '../application/delivery-service';
import { workItemPath } from '../application/wbs';

interface Props {
  items: readonly BreakdownItem[];
  selected: BreakdownItem | undefined;
  busy: boolean;
  onSave: (input: WorkItemInput, id?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function WbsEditor({ items, selected, busy, onSave, onDelete }: Props) {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [type, setType] = useState<BreakdownItemType>('Deliverable');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const expectedParent = type === 'WorkPackage' ? 'Deliverable' : 'WorkPackage';
  const parents = items.filter(
    (item) =>
      item.type === expectedParent &&
      (mode !== 'edit' || item.id !== selected?.id),
  );

  function startEditing() {
    if (!selected) return;
    setMode('edit');
    setType(selected.type);
    setName(selected.name);
    setParentId(selected.parentId ?? '');
  }
  function startCreating() {
    setMode('create');
    setType(
      selected?.type === 'Deliverable'
        ? 'WorkPackage'
        : selected?.type === 'WorkPackage'
          ? 'Activity'
          : 'Deliverable',
    );
    setParentId(selected && selected.type !== 'Activity' ? selected.id : '');
    setName('');
  }

  return (
    <section
      aria-labelledby="delivery-wbs-editor-heading"
      className="delivery-wbs-editor"
    >
      <h3 id="delivery-wbs-editor-heading">Work item editing</h3>
      <div className="delivery-actions">
        <button type="button" disabled={busy} onClick={startCreating}>
          Create work item
        </button>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={startEditing}
        >
          Rename or move selected item
        </button>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => {
            if (
              selected &&
              window.confirm(
                `Delete ${selected.name}? Items with children or allocations cannot be deleted.`,
              )
            )
              void onDelete(selected.id);
          }}
        >
          Delete selected item
        </button>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(
            {
              name,
              type,
              ...(type !== 'Deliverable' && parentId ? { parentId } : {}),
            },
            mode === 'edit' ? selected?.id : undefined,
          ).then((saved) => {
            if (saved) {
              setMode('create');
              setName('');
              setType('Deliverable');
              setParentId('');
            }
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>{mode === 'edit' ? 'Rename / move' : 'New work item'}</legend>
          <label htmlFor="work-item-type">Work item type</label>
          <select
            id="work-item-type"
            value={type}
            disabled={mode === 'edit'}
            onChange={(event) => {
              setType(event.target.value as BreakdownItemType);
              setParentId('');
            }}
          >
            <option value="Deliverable">Deliverable</option>
            <option value="WorkPackage">WorkPackage</option>
            <option value="Activity">Activity</option>
          </select>
          <label htmlFor="work-item-name">Work item name</label>
          <input
            id="work-item-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {type !== 'Deliverable' && (
            <>
              <label htmlFor="work-item-parent">
                Parent work item ({expectedParent})
              </label>
              <select
                id="work-item-parent"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Select a valid parent</option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {workItemPath(parent.id, items)}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="submit">
            {mode === 'edit' ? 'Save work item changes' : 'Add work item'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
