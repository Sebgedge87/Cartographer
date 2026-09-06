import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import {
  exportCurrentProject, openProject, pickProjectFile, promptNew, suggestPageName,
} from '../state/actions';

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
  const projectId = useUI((s) => s.projectId);
  const view = useUI((s) => s.view);
  const multi = useUI((s) => s.multi);
  const goHome = useUI((s) => s.goHome);

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
    /*
     * Capture phase, and the containment test that requires.
     *
     * On the bubble this never fired for a click inside the page editor: that
     * component stops pointerdown propagating so the scrim behind it does not
     * close, and the event therefore never reached the window. The menu could
     * then only be dismissed by picking something off it.
     */
    const onDown = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', close);
    };
  }, [context, set]);

  if (!context) return null;
  const { kind, id, world } = context.target;
  const close = () => set({ context: null });
  const act = (fn: () => void) => () => { close(); fn(); };

  let title = '';
  let items: Item[] = [];

  if (kind === 'project') {
    const project = doc.projects.find((p) => p.id === id);
    if (!project) return null;
    title = project.name;
    const rename = { label: 'Rename', run: act(() => set({ renamingProject: id })) };
    const remove = {
      label: 'Delete project',
      danger: true,
      run: act(() => set({ deletingProject: id })),
    };
    /*
     * A tile on the home screen is a project you are looking at rather than one you
     * are in, so the menu is only what you can do to it from outside: open it, name
     * it, throw it away. Exporting and adding an area both act on whatever project
     * is current, which from here is not necessarily this one.
     *
     * The test is the view, not the id: goHome() leaves projectId set, so the last
     * project open would otherwise get the in-project menu on its tile.
     */
    items = view === 'home'
      ? [{ label: 'Open project', run: act(() => openProject(id)) }, rename, remove]
      : [
          rename,
          { label: 'Export as JSON', run: act(exportCurrentProject) },
          { label: 'New area', run: act(() => promptNew({ kind: 'area', initial: 'New area' })) },
          remove,
        ];
  }

  if (kind === 'area') {
    const area = doc.areas.find((a) => a.id === id);
    if (!area) return null;
    const boards = doc.boards.filter((b) => b.areaId === id).length;
    title = area.name;
    items = [
      { label: 'New board', run: act(() => promptNew({ kind: 'board', initial: 'New board', areaId: id })) },
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
      {
        label: 'New page',
        run: act(() => promptNew({ kind: 'page', initial: suggestPageName(), boardId: id })),
      },
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
    // A band selection acts as one thing: the menu is about the group when the
    // page clicked is part of it, and about that page alone otherwise.
    const group = multi.length > 1 && multi.includes(id) ? multi : null;
    title = group ? `${group.length} pages` : page.title;
    items = group
      ? [
          {
            label: `Delete ${group.length} pages`,
            danger: true,
            run: act(() => {
              for (const pid of group) doc.deletePage(pid);
              set({ sel: null, multi: [], editing: null });
              showToast(`Deleted ${group.length} pages`);
            }),
          },
          { label: 'Clear selection', run: act(() => set({ multi: [], sel: null })) },
        ]
      : [
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
      {
        label: 'New page here',
        run: act(() =>
          promptNew({ kind: 'page', initial: suggestPageName(), boardId: id, ...(world ? { at: world } : {}) })),
      },
      {
        label: 'New board',
        run: act(() => board && promptNew({ kind: 'board', initial: 'New board', areaId: board.areaId })),
      },
      {
        label: 'Tidy this board',
        run: act(() => {
          const moved = doc.arrangeBoard(id);
          showToast(moved ? `Tidied ${moved} card${moved === 1 ? '' : 's'}` : 'Already tidy');
        }),
      },
    ];
  }

  /*
   * The fallback, for a right-click that landed on nothing in particular — empty
   * rail, a heading, the space beside a view. It carries what is true wherever you
   * are rather than what is true of a thing you clicked.
   */
  if (kind === 'app') {
    const newProject = {
      label: 'New project',
      run: act(() => promptNew({ kind: 'project', initial: 'New project' })),
    };
    const project = doc.projects.find((p) => p.id === projectId);

    if (view === 'home') {
      // Nothing here acts on a current project, whatever projectId still says: the
      // only things true on the home screen are making a project and bringing one in.
      title = 'Cartographer';
      items = [newProject, { label: 'Import JSON', run: act(pickProjectFile) }];
    } else if (project) {
      title = project.name;
      items = [
        { label: 'New area', run: act(() => promptNew({ kind: 'area', initial: 'New area' })) },
        { label: 'Timeline', run: act(() => set({ mode: 'timeline' })) },
        { label: 'Calendar', run: act(() => set({ mode: 'calendar' })) },
        { label: 'Export as JSON', run: act(exportCurrentProject) },
        { label: 'All projects', run: act(goHome) },
      ];
    } else {
      title = 'Cartographer';
      items = [newProject];
    }
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
