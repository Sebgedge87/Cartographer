import { useMemo } from 'react';
import type { ViewMode } from '../state/types';
import { blockType, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { createArea } from '../state/actions';

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: 'board', label: 'BOARD' },
  { key: 'table', label: 'PAGES' },
  { key: 'schema', label: 'SCHEMA' },
];

export function PagesRail() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const mode = useUI((s) => s.mode);
  const sel = useUI((s) => s.sel);
  const search = useUI((s) => s.search);
  const collapsed = useUI((s) => s.collapsed);
  const renamingArea = useUI((s) => s.renamingArea);
  const density = useUI((s) => s.density);
  const set = useUI((s) => s.set);
  const openPage = useUI((s) => s.openPage);
  const toggleArea = useUI((s) => s.toggleArea);

  const schema = schemaFor(doc, projectId);
  const query = search.trim().toLowerCase();
  const dense = density === 'dense';

  const tree = useMemo(() => {
    const outCount = new Map<string, number>();
    for (const e of doc.edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    return doc.areas
      .filter((a) => a.projectId === projectId)
      .map((area) => ({
        area,
        color: blockType(schema, area.defaultType).color,
        pages: doc.pages
          .filter((p) => p.areaId === area.id && (!query || p.title.toLowerCase().includes(query)))
          .map((p) => ({ page: p, type: blockType(schema, p.type), links: outCount.get(p.id) ?? 0 })),
      }));
    // schema is derived from doc; doc identity change is enough to recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, projectId, query]);

  const total = doc.pages.filter((p) => p.projectId === projectId).length;

  return (
    <div className="rail">
      <div className="rail__head">
        <span className="label">Pages</span>
        <span className="rail__count">{total}</span>
      </div>

      <div className="rail__tree">
        {tree.map(({ area, color, pages }) => {
          const open = !collapsed[area.id] || !!query;
          const active = area.id === areaId;
          return (
            <div key={area.id}>
              <div
                className={
                  'area-row' +
                  (dense ? '' : ' area-row--comfortable') +
                  (active ? ' area-row--active' : '')
                }
                style={{ ['--tint' as string]: color }}
                onClick={() => set({ areaId: area.id, mode: 'board', sel: null })}
                onDoubleClick={() => set({ renamingArea: area.id })}
              >
                <button
                  className="area-row__caret"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArea(area.id);
                  }}
                  title={open ? 'Collapse' : 'Expand'}
                >
                  {open ? '▾' : '▸'}
                </button>
                <span className="area-row__dot" />
                {renamingArea === area.id ? (
                  <input
                    className="field field--mono"
                    autoFocus
                    value={area.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => doc.renameArea(area.id, e.target.value)}
                    onBlur={() => set({ renamingArea: null })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                    }}
                  />
                ) : (
                  <span className="area-row__name truncate">{area.name}</span>
                )}
                <span className="area-row__count">{pages.length}</span>
                <button
                  className="area-row__add"
                  title="New page in this area"
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    set({ newMenu: { areaId: area.id, left: Math.round(r.left - 260), top: Math.round(r.bottom + 6) } });
                  }}
                >
                  +
                </button>
              </div>

              {open &&
                pages.map(({ page, type, links }) => (
                  <button
                    key={page.id}
                    className={
                      'page-row' +
                      (dense ? '' : ' page-row--comfortable') +
                      (page.id === sel ? ' page-row--selected' : '')
                    }
                    style={{ ['--tint' as string]: type.color }}
                    onClick={() => set({ sel: page.id, areaId: page.areaId, mode: 'board' })}
                    onDoubleClick={() => openPage(page.id, page.areaId)}
                  >
                    <span className="page-row__code">{type.code}</span>
                    <span className="page-row__title truncate">{page.title}</span>
                    {links > 0 && <span className="page-row__links">{links}↗</span>}
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      <div className="rail__foot">
        <button className="btn btn--sm btn--dashed" style={{ width: '100%' }} onClick={createArea}>
          + AREA
        </button>

        {/* Views live with the rest of the navigation rather than in the top bar,
            which is now just a title. Also reachable from the command palette. */}
        <div className="segments rail__views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className="segment"
              aria-pressed={mode === v.key}
              onClick={() => set({ mode: v.key })}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="rail__hint">DBL-CLICK CARD TO EDIT · DRAG PORT TO LINK</div>
      </div>
    </div>
  );
}
