import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import type { BlockType, Page } from '../state/types';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

interface Props {
  page: Page;
  type: BlockType;
  /** True when the page has forked off its type and carries its own layout. */
  custom: boolean;
}

/**
 * The two operations people get confused by, with the difference spelled out:
 * one edits the shared block type, the other detaches this page from it.
 */
export function FieldsMenu({ page, type, custom }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const showToast = useUI((s) => s.showToast);
  const wrap = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrap, close);


  const addToType = () => {
    const trimmed = label.trim();
    if (!trimmed || !projectId) return;
    doc.addTypeField(projectId, page.type, {
      key: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label: trimmed,
      kind: 'text',
    });
    setLabel('');
    setOpen(false);
    showToast(`Added “${trimmed}” to every ${type.label}`);
  };

  const used = doc.pages.filter((p) => p.projectId === page.projectId && p.type === page.type).length;

  return (
    <div className="fields-menu" ref={wrap}>
      <button
        className={'btn btn--sm' + (open ? ' btn--on' : '')}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Fields and layout"
      >
        FIELDS ▾
      </button>

      {open && (
        <div className="fields-menu__panel" onClick={(e) => e.stopPropagation()}>
          {custom ? (
            <div className="fields-menu__group">
              <div className="fields-menu__label">This page has its own layout</div>
              <p className="fields-menu__desc">
                It no longer follows the {type.label} schema, so the fields above belong to this
                page alone. Other {type.label} pages are unaffected.
              </p>
              <button
                className="btn btn--sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  const made = doc.promoteType(page.id);
                  setOpen(false);
                  if (made) showToast(`“${made.label}” is now a block type — it has a /command too`);
                }}
              >
                SAVE AS A NEW BLOCK TYPE
              </button>
              <p className="fields-menu__desc">
                Turns this layout into a reusable type, with its own <code>/</code> command.
              </p>
            </div>
          ) : (
            <>
              <div className="fields-menu__group">
                <div className="fields-menu__label">Add a field to every {type.label}</div>
                <p className="fields-menu__desc">
                  Changes the {type.label} block type itself. All {used} {type.label} page
                  {used === 1 ? '' : 's'} in this project gain the field.
                </p>
                <div className="fields-menu__row">
                  <input
                    className="field"
                    placeholder="Field name"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addToType(); }
                    }}
                  />
                  <button className="btn btn--sm btn--fill" onClick={addToType} disabled={!label.trim()}>
                    ADD
                  </button>
                </div>
              </div>

              <div className="fields-menu__group fields-menu__group--last">
                <div className="fields-menu__label">Give this page its own layout</div>
                <p className="fields-menu__desc">
                  Detaches this one page from the {type.label} schema so you can add, reorder and
                  remove fields freely. Nothing else changes.
                </p>
                <button
                  className="btn btn--sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    doc.setCustom(page.id, (list) => list);
                    setOpen(false);
                    showToast('This page now has its own layout');
                  }}
                >
                  CUSTOMISE THIS PAGE
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
