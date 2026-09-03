import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { createBoard, createPage } from '../state/actions';

interface Item {
  label: string;
  run: () => void;
  danger?: boolean;
  /** Reason the item cannot be used; shown as a tooltip and disables it. */
  blocked?: string;
}

/**
 * One menu for every right-click target. What was clicked lives in the UI store as
 * a {kind, id}; the items are derived here, so the rail and the board only have to
 * report what was under the cursor.
 */
export function ContextMenu() {
  const doc = useDoc();
  const context = useUI((s) => s.context);
  const set = useUI((s) => s.set);
  const openBoard = useUI((s) => s.openBoard);
  const openPage = useUI((s) => s.openPage);
  const showToast = useUI((s) => s.showToast);

  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Flip the menu back on screen when the click was near an edge.
  useLayoutEffect(() => {
    if (!context) return;
    const el = panel.current;
    const w = el?.offsetWidth ?? 190;
    const h = el?.offsetHeight ?? 200;
    setPos({
      x: Math.max(6, Math.min(context.x, window.innerWidth - w - 6)),
      y: Math.max(6, Math.min(context.y, window.innerHeight - h - 6)),
    });
  }, [context]);

  useEffect(() => {
    if (!context) return;
    const close = () => set({ context: null });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [context, set]);

  if (!context) return null;
  const { kind, id, world } = context.target;
  const close = () => set({ context: null });
  const act = (fn: () => void) => () => { close(); fn(); };

  let title = '';
  let items: Item[] = [];

  if (kind === 'area') {
    const area = doc.areas.find((a) => a.id === id);
    if (!area) return null;
    const boards = doc.boards.filter((b) => b.areaId === id).length;
    title = area.name;
    items = [
      { label: 'New board', run: act(() => createBoard(id)) },
      { label: 'Rename', run: act(() => set({ renamingArea: id })) },
      {
        label: 'Delete area',
        danger: true,
        run: act(() => {
          doc.deleteArea(id);
          const left = useDoc.getState().areas.find((a) => a.projectId === area.projectId);
          set({ areaId: left?.id ?? null, boardId: null, mode: 'area', sel: null, editing: null });
          showToast(`Deleted “${area.name}” and its ${boards} board${boards === 1 ? '' : 's'}`);
        }),
      },
    ];
  }

  if (kind === 'board') {
    const board = doc.boards.find((b) => b.id === id);
    if (!board) return null;
    const pages = doc.pages.filter((p) => p.boardId === id).length;
    const siblings = doc.boards.filter((b) => b.areaId === board.areaId).length;
    title = board.name;
    items = [
      { label: 'Open board', run: act(() => openBoard(id, board.areaId)) },
      { label: 'New page', run: act(() => createPage({ boardId: id })) },
      { label: 'Rename', run: act(() => set({ renamingBoard: id })) },
      {
        label: 'Delete board',
        danger: true,
        // An area with no boards has nowhere to put a page, so keep the last one.
        ...(siblings <= 1 ? { blocked: 'An area needs at least one board' } : {}),
        run: act(() => {
          doc.deleteBoard(id);
          const left = useDoc.getState().boards.find((b) => b.areaId === board.areaId);
          set({ boardId: left?.id ?? null, mode: left ? 'board' : 'area', sel: null, editing: null });
          showToast(`Deleted “${board.name}” and its ${pages} page${pages === 1 ? '' : 's'}`);
        }),
      },
    ];
  }

  if (kind === 'page') {
    const page = doc.pages.find((p) => p.id === id);
    if (!page) return null;
    title = page.title;
    items = [
      { label: 'Open', run: act(() => openPage(id, page.boardId)) },
      {
        label: 'Duplicate',
        run: act(() => {
          const copy = doc.duplicatePage(id);
          if (copy) set({ sel: copy });
        }),
      },
      {
        label: 'Delete page',
        danger: true,
        run: act(() => {
          doc.deletePage(id);
          set({ sel: null, editing: null });
          showToast(`Deleted “${page.title}”`);
        }),
      },
    ];
  }

  if (kind === 'canvas') {
    const board = doc.boards.find((b) => b.id === id);
    title = board?.name ?? 'Board';
    items = [
      { label: 'New page here', run: act(() => createPage({ boardId: id, ...(world ? { at: world } : {}) })) },
      { label: 'New board', run: act(() => board && createBoard(board.areaId)) },
    ];
  }

  return (
    <div
      ref={panel}
      className="context"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="context__title truncate">{title}</div>
      {items.map((item) => (
        <button
          key={item.label}
          className={'context__item' + (item.danger ? ' context__item--danger' : '')}
          disabled={!!item.blocked}
          title={item.blocked}
          onClick={item.run}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
