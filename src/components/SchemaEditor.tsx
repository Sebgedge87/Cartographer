import type { FieldKind } from '../state/types';
import { blockType, schemaFor, typeOptions, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

const FIELD_KINDS: { value: FieldKind; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'number', label: 'number' },
  { value: 'long', label: 'long' },
  { value: 'ref', label: 'link' },
];

const EXTENSIONS = [
  { name: 'Custom / commands', on: true, desc: 'Every block type you define gets its own /command that creates the page and links it.' },
  { name: 'JSON interchange', on: true, desc: 'Export and import the whole project — pages, links, schema — as portable JSON.' },
  { name: 'Dice engine', on: true, desc: 'Any dice expression in prose is clickable and rolls inline.' },
  { name: 'Template library', on: false, desc: 'Save a page as a reusable template with its fields pre-filled.' },
  { name: 'Print / layout export', on: false, desc: 'Compose selected pages into a printable rulebook spread.' },
  { name: 'Desktop build', on: false, desc: 'Same board, offline, local files. Web and installable share this data format.' },
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
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
