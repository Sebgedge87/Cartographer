import { useMemo, useState } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

/**
 * Send pages to another board.
 *
 * A page could only ever be created on a board, never moved off one, so a location
 * filed under the wrong subject had to be deleted and typed again. Boards are
 * listed under their areas because that is how they are found everywhere else, and
 * the board the pages are already on is shown as their current home rather than
 * hidden — it says where you are, which is half of choosing where to go.
 */
export function MoveToBoard() {
  const doc = useDoc();
  const moving = useUI((s) => s.movingPages);
  const projectId = useUI((s) => s.projectId);
  const set = useUI((s) => s.set);
  const showToast = useUI((s) => s.showToast);
  const [filter, setFilter] = useState('');

  const pages = useMemo(
    () => doc.pages.filter((p) => moving?.includes(p.id)),
    [doc.pages, moving],
  );

  const areas = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return doc.areas
      .filter((a) => a.projectId === projectId)
      .map((area) => ({
        area,
        boards: doc.boards.filter(
          (b) => b.areaId === area.id && (!q || b.name.toLowerCase().includes(q) || area.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((a) => a.boards.length > 0);
  }, [doc.areas, doc.boards, projectId, filter]);

  if (!moving?.length || !pages.length) return null;

  const from = new Set(pages.map((p) => p.boardId));
  const close = () => { setFilter(''); set({ movingPages: null }); };

  const move = (boardId: string, name: string) => {
    const n = doc.movePagesToBoard(moving, boardId);
    close();
    set({ boardId, sel: pages[0]?.id ?? null, multi: [], mode: 'board' });
    showToast(n ? `Moved ${n === 1 ? '1 page' : `${n} pages`} to “${name}”` : 'Already there');
  };

  const what = pages.length === 1 ? `“${pages[0]!.title}”` : `${pages.length} pages`;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="prompt prompt--tall" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="prompt__title">Move {what}</h2>
        <p className="prompt__hint">
          Pick the board to send {pages.length === 1 ? 'it' : 'them'} to. They land in a row
          below whatever is already there, and keep their links.
        </p>
        <input
          className="field prompt__input"
          autoFocus
          placeholder="Filter boards"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}
        />

        <div className="picker">
          {areas.map(({ area, boards }) => (
            <div key={area.id} className="picker__group">
              <div className="picker__area">{area.name}</div>
              {boards.map((board) => (
                <button
                  key={board.id}
                  className="picker__board"
                  disabled={from.has(board.id) && from.size === 1}
                  onClick={() => move(board.id, board.name)}
                >
                  <span className="truncate">{board.name}</span>
                  {from.has(board.id) && <span className="picker__here">HERE</span>}
                </button>
              ))}
            </div>
          ))}
          {!areas.length && <div className="picker__empty">No board matches that.</div>}
        </div>

        <div className="prompt__row">
          <button className="btn" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
