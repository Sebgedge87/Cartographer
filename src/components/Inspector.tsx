import { blockType, pageFields, schemaFor, typeOptions, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { FieldGrid } from './FieldGrid';

export function Inspector() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const sel = useUI((s) => s.sel);
  const set = useUI((s) => s.set);

  const page = doc.pages.find((p) => p.id === sel);
  const schema = schemaFor(doc, projectId);

  if (!page) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">
          <b>NOTHING SELECTED</b>
          <span>Pick a card on the board or a row in the rail to edit its stat block.</span>
        </div>
      </aside>
    );
  }

  const type = blockType(schema, page.type);
  const linkRow = (id: string, kind: string, key: string) => {
    const other = doc.pages.find((p) => p.id === id);
    if (!other) return null;
    const otherType = blockType(schema, other.type);
    return (
      <button
        key={key}
        className="link-row"
        style={{ ['--tint' as string]: otherType.color }}
        onClick={() => set({ sel: other.id, areaId: other.areaId })}
      >
        <span className="link-row__code">{otherType.code}</span>
        <span className="link-row__title truncate">{other.title}</span>
        <span className="link-row__kind">{kind}</span>
      </button>
    );
  };

  const outbound = doc.edges.filter((e) => e.from === page.id);
  const inbound = doc.edges.filter((e) => e.to === page.id);

  return (
    <aside className="inspector">
      <div className="inspector__section">
        <div className="inspector__row">
          <span className="chip chip--lg" style={{ ['--chip' as string]: type.color }}>{type.code}</span>
          <select
            className="field field--mono"
            value={page.type}
            onChange={(e) => doc.patchPage(page.id, { type: e.target.value })}
          >
            {typeOptions(schema, page.type).map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <input
          className="field"
          value={page.title}
          onChange={(e) => doc.patchPage(page.id, { title: e.target.value })}
        />
      </div>

      <div className="inspector__section">
        <div className="inspector__row"><span className="label">Fields</span></div>
        <FieldGrid page={page} fields={pageFields(doc, page)} editable={false} cols={1} />
        <button
          className="btn btn--fill btn--sm"
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
          onClick={() => set({ editing: page.id, fieldsOpen: true })}
        >
          OPEN PAGE EDITOR
        </button>
      </div>

      <div className="inspector__section">
        <div className="inspector__row"><span className="label">Links out</span></div>
        {outbound.length === 0 && <div className="none-line">NONE</div>}
        {outbound.map((e) => linkRow(e.to, e.kind, e.id))}
      </div>

      <div className="inspector__section">
        <div className="inspector__row"><span className="label">Backlinks</span></div>
        {inbound.length === 0 && <div className="none-line">NONE</div>}
        {inbound.map((e) => linkRow(e.from, e.kind, e.id))}
      </div>

      <div className="inspector__section" style={{ borderBottom: 'none' }}>
        <button
          className="btn btn--sm btn--danger"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => {
            doc.deletePage(page.id);
            set({ sel: null, editing: null });
          }}
        >
          DELETE PAGE
        </button>
      </div>
    </aside>
  );
}
