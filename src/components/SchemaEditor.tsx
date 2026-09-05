import type { FieldKind } from '../state/types';
import type { ReactNode } from 'react';
import { blockType, schemaFor, typeOptions, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

const FIELD_KINDS: { value: FieldKind; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'number', label: 'number' },
  { value: 'long', label: 'long' },
  { value: 'ref', label: 'link' },
];

/**
 * `how` is the part that was missing: what a switched-on extension actually asks you
 * to type or click. For a SLOT it says what stands in for it today instead, so the
 * card is never just a promise.
 */
const EXTENSIONS: { name: string; on: boolean; desc: string; how: ReactNode }[] = [
  {
    name: 'Custom / commands',
    on: true,
    desc: 'Every block type you define gets its own /command that creates the page and links it.',
    how: (
      <>
        In a page body, type <code>/</code> at the start of a line. Every type in this project is
        listed — <code>/creature</code>, <code>/item</code>, one per row. Picking one makes a new page
        of that type on this board and drops a <code>[[link]]</code> to it where the caret was.
        Rename a type and its command follows; hide a type and its command goes away.
      </>
    ),
  },
  {
    name: 'JSON interchange',
    on: true,
    desc: 'Export and import the whole project — pages, links, schema — as portable JSON.',
    how: (
      <>
        <b>Settings → Export as JSON</b> writes this project to a file: pages, boards, areas, the
        links you drew by hand, and the schema above. <b>Home → IMPORT</b> reads one back as a new
        project. Image references travel with it, but the picture files themselves do not — they
        live outside the document.
      </>
    ),
  },
  {
    name: 'Dice engine',
    on: true,
    desc: 'Any dice expression in prose is clickable and rolls inline.',
    how: (
      <>
        Write the expression anywhere in a page body — <code>2d6+3</code>, <code>d20</code>,{' '}
        <code>4d8-1</code>. The pattern is <b>dice, d, sides, then an optional + or −
        modifier</b>; leave the count off and it rolls one. It turns into a button in the preview on
        the right: click it and real dice are thrown across the screen — proper solids, simulated
        physics — and the numbers are whatever they land on. The token shows the total as they
        settle, and the whole roll is written out at the foot of the screen, like{' '}
        <code>2d6+3 → [4 5] +3 = 12</code>. Click anywhere to clear them early. Up to 20 dice in one
        expression. The <code>2d6</code> button on the format bar and <code>/dice</code> both insert
        one. Nothing is stored — every click is a fresh roll. With reduced motion turned on, or on
        a machine without 3D, the roll is simply reported.
      </>
    ),
  },
  {
    name: 'Spellcheck',
    on: true,
    desc: 'The editor checks its own spelling, against a dictionary that knows your invented names.',
    how: (
      <>
        A browser will not let a page teach its own spellchecker a word, so this one is the app’s:
        an English dictionary loaded the first time you open a page body, with{' '}
        <b>every name this project already uses</b> added to it — page titles, areas, boards, block
        types, months, weekdays and moons. Rename a keep and the old name stops being known.
        Misspellings are underlined in the left-hand pane; <b>right-click one</b> for suggestions,
        or <b>Add to dictionary</b> to keep it for good. Added words are listed under{' '}
        <b>Settings → Writing</b>, where clicking one takes it back out; they travel with the
        project, in its export and its sync. Code spans, links, <code>[[wikilinks]]</code>, dice and{' '}
        <code>@Page.field</code> references are not prose and are never checked, and neither is
        anything in capitals — <code>HP</code> is not a typo. Turn the whole thing off under{' '}
        <b>Settings → Writing</b> and the dictionary is dropped from memory.
      </>
    ),
  },
  {
    name: 'Template library',
    on: false,
    desc: 'Save a page as a reusable template with its fields pre-filled.',
    how: (
      <>
        Not built. The nearest thing today: right-click a page and choose <b>Duplicate</b>, which
        copies its fields, body and images onto the same board.
      </>
    ),
  },
  {
    name: 'Print / layout export',
    on: false,
    desc: 'Compose selected pages into a printable rulebook spread.',
    how: (
      <>
        Not built. Today the ways out are <b>Export as JSON</b>, or your browser’s own print command
        on whatever is on screen.
      </>
    ),
  },
  {
    name: 'Desktop build',
    on: false,
    desc: 'Same board, offline, local files. Web and installable share this data format.',
    how: (
      <>
        Not built, and nothing to do here. It matters that the format is already the same: a desktop
        build would open the exact files this one exports, so nothing you write now is stranded.
      </>
    ),
  },
];

export function SchemaEditor() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const showToast = useUI((s) => s.showToast);
  const set = useUI((s) => s.set);

  if (!projectId) return null;
  const schema = schemaFor(doc, projectId);
  const areas = doc.areas.filter((a) => a.projectId === projectId);

  return (
    <div className="schema">
      <div className="schema__inner">
        <section className="schema__section">
          <div className="schema__head">
            <span className="label">Block types</span>
            <span className="schema__note">
              Yours to shape — rename, reorder, hide the ones you never use, delete the rest
            </span>
            <div className="spacer" />
            <button
              className="btn btn--sm"
              onClick={() => {
                doc.addType(projectId);
                showToast('Block type added — define its fields');
              }}
            >
              + BLOCK TYPE
            </button>
          </div>

          <div className="type-grid">
            {schema.typeOrder
              .filter((key) => key !== 'blank' && schema.types[key])
              .map((key) => {
                const type = blockType(schema, key);
                const used = doc.pages.filter((p) => p.projectId === projectId && p.type === key).length;
                return (
                  <div
                    key={key}
                    className={'type-card' + (type.hidden ? ' type-card--hidden' : '')}
                    style={{ ['--tint' as string]: type.color }}
                  >
                    <div className="type-card__head">
                      <span className="chip chip--lg" style={{ ['--chip' as string]: type.color }}>{type.code}</span>
                      <input
                        className="field"
                        value={type.label}
                        onChange={(e) => doc.renameType(projectId, key, e.target.value)}
                      />
                      <span className="type-card__used">{used} USED</span>
                    </div>

                    <div className="type-card__tools">
                      <button
                        className={'btn btn--sm' + (type.hidden ? '' : ' btn--on')}
                        title={
                          type.hidden
                            ? 'Hidden — not offered when making a page'
                            : 'Offered in the new-page menu, quick buttons and / commands'
                        }
                        onClick={() => doc.setTypeHidden(projectId, key, !type.hidden)}
                      >
                        {type.hidden ? 'HIDDEN' : 'SHOWN'}
                      </button>
                      <span className="spacer" />
                      <button className="icon-btn" title="Move earlier" onClick={() => doc.moveType(projectId, key, -1)}>▴</button>
                      <button className="icon-btn" title="Move later" onClick={() => doc.moveType(projectId, key, 1)}>▾</button>
                      <button
                        className="icon-btn"
                        disabled={used > 0}
                        title={
                          used > 0
                            ? `${used} page${used === 1 ? '' : 's'} still use this — retype them first, or hide it instead`
                            : 'Delete this block type'
                        }
                        onClick={() => {
                          if (!doc.deleteType(projectId, key)) return;
                          showToast(`Deleted “${type.label}”`);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div className="type-card__body">
                      {type.fields.map((field, index) => (
                        <div key={field.key} className="type-field">
                          <input
                            className="field"
                            value={field.label}
                            onChange={(e) => doc.patchTypeField(projectId, key, index, { label: e.target.value })}
                          />
                          <select
                            className="field field--mono"
                            value={field.kind}
                            onChange={(e) =>
                              doc.patchTypeField(projectId, key, index, { kind: e.target.value as FieldKind })
                            }
                          >
                            {FIELD_KINDS.map((k) => (
                              <option key={k.value} value={k.value}>{k.label}</option>
                            ))}
                          </select>
                          <button
                            className="icon-btn"
                            title="Remove field"
                            onClick={() => doc.deleteTypeField(projectId, key, index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        className="btn btn--sm btn--dashed"
                        onClick={() => doc.addTypeField(projectId, key)}
                      >
                        + FIELD
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="schema__section">
          <div className="schema__head">
            <span className="label">Areas &amp; labels</span>
            <span className="schema__note">Deleting an area deletes its pages and their links</span>
          </div>

          <div className="area-list">
            {areas.map((area) => (
              <div key={area.id} className="area-line" style={{ ['--tint' as string]: blockType(schema, area.defaultType).color }}>
                <span className="area-line__dot" />
                <input
                  className="field"
                  value={area.name}
                  onChange={(e) => doc.renameArea(area.id, e.target.value)}
                />
                <span className="area-line__label">NEW PAGES ARE</span>
                <select
                  className="field field--mono"
                  value={area.defaultType}
                  onChange={(e) => doc.setAreaDefaultType(area.id, e.target.value)}
                >
                  {typeOptions(schema, area.defaultType).map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <span className="area-line__count">
                  {doc.boards.filter((b) => b.areaId === area.id).length} BOARDS
                </span>
                <button
                  className="icon-btn"
                  title="Delete area and its pages"
                  onClick={() => {
                    doc.deleteArea(area.id);
                    const left = useDoc.getState().areas.find((a) => a.projectId === projectId);
                    set({ areaId: left?.id ?? null, sel: null, editing: null });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="btn btn--sm btn--dashed"
              onClick={() => {
                const id = doc.addArea(projectId);
                set({ areaId: id });
              }}
            >
              + AREA
            </button>
          </div>
        </section>

        <section className="schema__section">
          <div className="schema__head">
            <span className="label">Extensions</span>
            <span className="schema__note">SLOT entries are the seams this build leaves open</span>
          </div>
          <div className="plugin-grid">
            {EXTENSIONS.map((x) => (
              <div key={x.name} className="plugin">
                <div className="plugin__head">
                  <span className="plugin__name">{x.name}</span>
                  <span className={'plugin__pill' + (x.on ? ' plugin__pill--on' : '')}>
                    {x.on ? 'ON' : 'SLOT'}
                  </span>
                </div>
                <p className="plugin__desc">{x.desc}</p>
                <p className="plugin__how">
                  <b className="plugin__how-label">{x.on ? 'How to use it' : 'Instead, today'}</b>
                  {x.how}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
