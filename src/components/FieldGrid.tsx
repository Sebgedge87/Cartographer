import type { Field, FieldKind, Page } from '../state/types';
import { useDoc } from '../state/docStore';

const ELEMENT_KINDS: { value: FieldKind; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'number', label: 'num' },
  { value: 'long', label: 'long' },
  { value: 'ref', label: 'link' },
  { value: 'heading', label: 'sect' },
];

interface Props {
  page: Page;
  fields: Field[];
  /** Show the per-element controls (label, kind, width, order, delete). */
  editable: boolean;
  /** 0 = auto-fill. */
  cols: 0 | 1 | 2 | 3 | 4;
}

/**
 * The schema-driven stat block. The same grid backs the inspector (values only) and
 * the page editor (values plus, on a custom page, the element builder).
 */
export function FieldGrid({ page, fields, editable, cols }: Props) {
  const setPageField = useDoc((s) => s.setPageField);
  const setCustom = useDoc((s) => s.setCustom);
  const moveElement = useDoc((s) => s.moveElement);
  const refOptions = useDoc((s) =>
    s.pages.filter((p) => p.projectId === page.projectId && p.id !== page.id),
  );

  if (!fields.length) return null;

  return (
    <div
      className={'fields' + (cols ? '' : ' fields--auto') + (editable ? ' fields--editing' : '')}
      style={cols ? { gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` } : undefined}
    >
      {fields.map((field, index) => {
        const wide = field.wide || field.kind === 'long' || field.kind === 'heading';
        const value = page.fields[field.key] ?? '';

        if (field.kind === 'heading' && !editable) {
          return (
            <div key={field.key} className="field-cell__heading">
              {field.label}
            </div>
          );
        }

        return (
          <div
            key={field.key}
            className={'field-cell' + (wide ? ' field-cell--wide' : '')}
          >
            {editable ? (
              <div className="field-cell__head">
                <input
                  className="field field--mono"
                  value={field.label}
                  onChange={(e) =>
                    setCustom(page.id, (list) => {
                      const next = list.slice();
                      const f = next[index];
                      if (f) next[index] = { ...f, label: e.target.value };
                      return next;
                    })
                  }
                />
                <select
                  className="field field--mono"
                  value={field.kind}
                  onChange={(e) => {
                    const kind = e.target.value as FieldKind;
                    setCustom(page.id, (list) => {
                      const next = list.slice();
                      const f = next[index];
                      if (f) next[index] = { ...f, kind, wide: kind === 'long' || kind === 'heading' ? true : f.wide };
                      return next;
                    });
                  }}
                >
                  {ELEMENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <button
                  className={'icon-btn' + (field.wide ? ' icon-btn--on' : '')}
                  title="Full width"
                  onClick={() =>
                    setCustom(page.id, (list) => {
                      const next = list.slice();
                      const f = next[index];
                      if (f) next[index] = { ...f, wide: !f.wide };
                      return next;
                    })
                  }
                >
                  ↔
                </button>
                <button className="icon-btn" title="Move up" onClick={() => moveElement(page.id, index, -1)}>▴</button>
                <button className="icon-btn" title="Move down" onClick={() => moveElement(page.id, index, 1)}>▾</button>
                <button
                  className="icon-btn"
                  title="Remove element"
                  onClick={() => setCustom(page.id, (list) => list.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ) : (
              <span className="field-cell__label">{field.label}</span>
            )}

            {field.kind === 'heading' ? null : field.kind === 'ref' ? (
              <select
                className="field field--mono"
                value={value}
                onChange={(e) => setPageField(page.id, field, e.target.value)}
              >
                <option value="">—</option>
                {refOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            ) : field.kind === 'long' ? (
              <textarea
                className="field"
                value={value}
                placeholder="—"
                onChange={(e) => setPageField(page.id, field, e.target.value)}
              />
            ) : (
              <input
                className="field"
                type={field.kind === 'number' ? 'number' : 'text'}
                placeholder={field.kind === 'number' ? '0' : '—'}
                value={value}
                onChange={(e) => setPageField(page.id, field, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
