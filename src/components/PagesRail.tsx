import { useMemo } from 'react';
import { blockType, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { createArea, createBoard } from '../state/actions';
import { SettingsMenu } from './SettingsMenu';

/**
 * The navigation tree: area -> board -> page.
 *
 * An area is a category and has no canvas; a board is one subject and holds the
 * pages. Clicking an area shows its boards, clicking a board opens its canvas.
 */
export function PagesRail() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const boardId = useUI((s) => s.boardId);
  const sel = useUI((s) => s.sel);
  const search = useUI((s) => s.search);
  const collapsed = useUI((s) => s.collapsed);
  const renamingArea = useUI((s) => s.renamingArea);
  const renamingBoard = useUI((s) => s.renamingBoard);
  const density = useUI((s) => s.density);
  const set = useUI((s) => s.set);
  const openArea = useUI((s) => s.openArea);
  const openBoard = useUI((s) => s.openBoard);
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
      .map((area) => {
        const boards = doc.boards
          .filter((b) => b.areaId === area.id)
          .map((board) => ({
            board,
            pages: doc.pages
              .filter((p) => p.boardId === board.id && (!query || p.title.toLowerCase().includes(query)))
              .map((p) => ({ page: p, type: blockType(schema, p.type), links: outCount.get(p.id) ?? 0 })),
          }))
          // While filtering, a board with no matching pages is just noise.
          .filter((b) => !query || b.pages.length > 0);
        return {
          area,
          color: blockType(schema, area.defaultType).color,
          boards,
          pageCount: boards.reduce((n, b) => n + b.pages.length, 0),
        };
      })
      .filter((a) => !query || a.boards.length > 0);
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
        {tree.map(({ area, color, boards, pageCount }) => {
          const areaOpen = !collapsed[area.id] || !!query;
          const areaActive = area.id === areaId;
          return (
            <div key={area.id}>
              <div
                className={
                  'area-row' + (dense ? '' : ' area-row--comfortable') +
                  (areaActive ? ' area-row--active' : '')
                }
                style={{ ['--tint' as string]: color }}
                onClick={() => openArea(area.id)}
                onDoubleClick={() => set({ renamingArea: area.id })}
              >
                <button
                  className="area-row__caret"
                  onClick={(e) => { e.stopPropagation(); toggleArea(area.id); }}
                  title={areaOpen ? 'Collapse' : 'Expand'}
                >
                  {areaOpen ? '▾' : '▸'}
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
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
                  />
                ) : (
                  <span className="area-row__name truncate">{area.name}</span>
                )}
                <span className="area-row__count">{pageCount}</span>
                <button
                  className="area-row__add"
                  title="New board in this area"
                  onClick={(e) => { e.stopPropagation(); createBoard(area.id); }}
                >
                  +
                </button>
              </div>

              {areaOpen && boards.map(({ board, pages }) => {
                const boardOpen = !collapsed[board.id] || !!query;
                return (
                  <div key={board.id}>
                    <div
                      className={
                        'board-row' + (dense ? '' : ' board-row--comfortable') +
                        (board.id === boardId ? ' board-row--active' : '')
                      }
                      onClick={() => openBoard(board.id, area.id)}
                      onDoubleClick={() => set({ renamingBoard: board.id })}
                    >
                      <button
                        className="area-row__caret"
                        onClick={(e) => { e.stopPropagation(); toggleArea(board.id); }}
                        title={boardOpen ? 'Collapse' : 'Expand'}
                      >
                        {boardOpen ? '▾' : '▸'}
                      </button>
                      {renamingBoard === board.id ? (
                        <input
                          className="field field--mono"
                          autoFocus
                          value={board.name}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => doc.renameBoard(board.id, e.target.value)}
                          onBlur={() => set({ renamingBoard: null })}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
                        />
                      ) : (
                        <span className="board-row__name truncate">{board.name}</span>
                      )}
                      <span className="area-row__count">{pages.length}</span>
                      <button
                        className="area-row__add"
                        title="New page on this board"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          set({ newMenu: { boardId: board.id, left: Math.round(r.left - 260), top: Math.round(r.bottom + 6) } });
                        }}
                      >
                        +
                      </button>
                    </div>

                    {boardOpen && pages.map(({ page, type, links }) => (
                      <button
                        key={page.id}
                        className={
                          'page-row' + (dense ? '' : ' page-row--comfortable') +
                          (page.id === sel ? ' page-row--selected' : '')
                        }
                        style={{ ['--tint' as string]: type.color }}
                        onClick={() => set({ sel: page.id, boardId: page.boardId, areaId: area.id, mode: 'board' })}
                        onDoubleClick={() => openPage(page.id, page.boardId)}
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
          );
        })}
      </div>

      <div className="rail__foot">
        <button className="btn btn--sm btn--dashed" style={{ width: '100%' }} onClick={createArea}>
          + AREA
        </button>
        <SettingsMenu />
        <div className="rail__hint">DBL-CLICK CARD TO EDIT · DRAG PORT TO LINK</div>
      </div>
    </div>
  );
}
