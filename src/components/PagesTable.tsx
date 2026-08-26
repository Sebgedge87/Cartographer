import { useMemo } from 'react';
import { blockType, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

const COLUMNS = ['#', 'TITLE', 'AREA', 'TYPE', 'OUT', 'IN', 'UPDATED'];

export function PagesTable() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const sel = useUI((s) => s.sel);
  const search = useUI((s) => s.search);
  const set = useUI((s) => s.set);
  const openPage = useUI((s) => s.openPage);

  const schema = schemaFor(doc, projectId);
  const query = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const outCount = new Map<string, number>();
    const inCount = new Map<string, number>();
    for (const e of doc.edges) {
      outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
      inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
    }
    return doc.pages
      .filter((p) => p.projectId === projectId && (!query || p.title.toLowerCase().includes(query)))
      .map((page) => ({
        page,
        type: blockType(schema, page.type),
        area: doc.areas.find((a) => a.id === page.areaId)?.name ?? '—',
        out: outCount.get(page.id) ?? 0,
        in: inCount.get(page.id) ?? 0,
        updated: new Date(page.updated).toISOString().slice(0, 10),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, projectId, query]);

  return (
    <div className="table">
      <div className="table__inner">
        <div className="table__row table__head">
          {COLUMNS.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>

        {rows.map((row, i) => (
          <div
            key={row.page.id}
            className={'table__row' + (row.page.id === sel ? ' table__row--selected' : '')}
            onClick={() => set({ sel: row.page.id })}
            onDoubleClick={() => openPage(row.page.id, row.page.areaId)}
          >
            <div className="table__num">{i + 1}</div>
            <div className="table__title truncate">{row.page.title}</div>
            <div className="table__area truncate">{row.area}</div>
            <div>
              <span className="chip" style={{ ['--chip' as string]: row.type.color }}>{row.type.code}</span>
            </div>
            <div className="table__meta">{row.out}</div>
            <div className="table__meta">{row.in}</div>
            <div className="table__meta">{row.updated}</div>
          </div>
        ))}

        {rows.length === 0 && <div className="table__empty">NO PAGES MATCH</div>}
      </div>
    </div>
  );
}
