import { useCallback, useEffect, useMemo, useRef } from 'react';
import { blockType, creatableTypeKeys, pageFields, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { edgePath, fitCamera, ghostStart, hierarchyDepth } from '../state/graph';
import { boardRect, promptNew, registerBoard, suggestPageName } from '../state/actions';
import { Maximize, Minimize } from 'lucide-react';
import { PageCard } from './PageCard';

/** Grid underlay: the pattern scrolls with the camera by offsetting its background. */
/**
 * The canvas grid. Its colours come from the theme rather than from here: these
 * were white at low alpha, which is a grid on the dark ground and nothing at all
 * on the light and parchment ones.
 */
function gridStyle(kind: string, x: number, y: number, z: number): React.CSSProperties {
  const g = 24 * z;
  const pos = `${x % g}px ${y % g}px`;
  if (kind === 'none') return { background: 'var(--canvas)' };
  if (kind === 'dots') {
    return {
      backgroundImage: 'radial-gradient(var(--grid-dot) 1px, transparent 1px)',
      backgroundSize: `${g}px ${g}px`,
      backgroundPosition: pos,
    };
  }
  const major = 'var(--grid-major)';
  const minor = 'var(--grid-minor)';
  return {
    backgroundImage:
      `linear-gradient(${major} 1px,transparent 1px),linear-gradient(90deg,${major} 1px,transparent 1px),` +
      `linear-gradient(${minor} 1px,transparent 1px),linear-gradient(90deg,${minor} 1px,transparent 1px)`,
    backgroundSize: `${g * 5}px ${g * 5}px,${g * 5}px ${g * 5}px,${g}px ${g}px,${g}px ${g}px`,
    backgroundPosition: pos,
  };
}

export function Board() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const boardId = useUI((s) => s.boardId);
  const sel = useUI((s) => s.sel);
  const multi = useUI((s) => s.multi);
  const marquee = useUI((s) => s.marquee);
  const cam = useUI((s) => s.cam);
  const grid = useUI((s) => s.grid);
  const focus = useUI((s) => s.focus);
  const setFocus = useUI((s) => s.setFocus);
  const ghost = useUI((s) => s.ghost);
  const link = useUI((s) => s.link);
  const set = useUI((s) => s.set);
  const openPage = useUI((s) => s.openPage);
  const panBy = useUI((s) => s.panBy);
  const zoomAt = useUI((s) => s.zoomAt);
  const setCam = useUI((s) => s.setCam);
  const showToast = useUI((s) => s.showToast);

  const el = useRef<HTMLDivElement>(null);
  const last = useRef({ x: 0, y: 0 });
  /** Sub-pixel remainder carried between moves so card positions stay integers
   *  without the drag drifting away from the cursor. */
  const residual = useRef({ x: 0, y: 0 });
  const schema = schemaFor(doc, projectId);

  useEffect(() => {
    registerBoard(el.current);
    return () => registerBoard(null);
  }, []);

  // Registered non-passively so preventDefault actually stops the page from scrolling.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.09 : 0.917);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const boardPages = useMemo(() => doc.pages.filter((p) => p.boardId === boardId), [doc.pages, boardId]);
  const onBoard = useMemo(() => new Map(boardPages.map((p) => [p.id, p])), [boardPages]);

  /*
   * How deep each card sits in the board's hierarchy, so a top-level region reads
   * differently from a landmark three levels under it. Derived from the links
   * rather than from where the cards happen to sit, so it is right whether or not
   * the board has ever been tidied, and it survives dragging one somewhere else.
   */
  const depth = useMemo(() => {
    const order = schema.typeOrder;
    const rank = (type: string) => {
      const i = order.indexOf(type);
      return i === -1 ? order.length : i;
    };
    return hierarchyDepth(boardPages, doc.edges, rank);
  }, [boardPages, doc.edges, schema.typeOrder]);

  const counts = useMemo(() => {
    const map = new Map<string, { out: number; in: number; off: number }>();
    const get = (id: string) => {
      let c = map.get(id);
      if (!c) map.set(id, (c = { out: 0, in: 0, off: 0 }));
      return c;
    };
    for (const e of doc.edges) {
      if (onBoard.has(e.from)) {
        get(e.from).out++;
        if (!onBoard.has(e.to)) get(e.from).off++;
      }
      if (onBoard.has(e.to)) {
        get(e.to).in++;
        if (!onBoard.has(e.from)) get(e.to).off++;
      }
    }
    return map;
  }, [doc.edges, onBoard]);

  const drawnEdges = useMemo(
    () =>
      doc.edges
        .filter((e) => onBoard.has(e.from) && onBoard.has(e.to))
        .map((e) => {
          const a = onBoard.get(e.from)!;
          const b = onBoard.get(e.to)!;
          const lit = sel === e.from || sel === e.to;
          return {
            id: e.id,
            d: edgePath(a, b, e.id),
            color: lit ? 'var(--accent)' : e.kind === 'field' ? 'var(--link)' : 'var(--edge-line)',
            width: lit ? 2 : 1.4,
            dash: e.kind === 'manual' ? '6 5' : undefined,
            opacity: lit ? 1 : 0.75,
          };
        }),
    [doc.edges, onBoard, sel],
  );

  /* ---------- pointer model: port → card → pan ---------- */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      e.currentTarget.setPointerCapture(e.pointerId);
      last.current = { x: e.clientX, y: e.clientY };

      residual.current = { x: 0, y: 0 };

      const port = target.closest('[data-port]')?.getAttribute('data-port');
      if (port) {
        set({ link: port, ghost: null, sel: port });
        return;
      }
      const card = target.closest('[data-pid]')?.getAttribute('data-pid');
      const world = () => {
        const r = boardRect();
        const ui = useUI.getState();
        return {
          x: (e.clientX - r.left - ui.cam.x) / ui.cam.z,
          y: (e.clientY - r.top - ui.cam.y) / ui.cam.z,
        };
      };

      if (card) {
        // Ctrl or ⌘ adds and removes one card without disturbing the rest.
        if (e.metaKey || e.ctrlKey) {
          const held = useUI.getState().multi;
          const dropping = held.includes(card);
          const next = dropping ? held.filter((id) => id !== card) : [...held, card];
          // Taking a card out must not leave it as `sel`, or it goes on looking
          // selected while no longer being part of the group.
          set({ sel: dropping ? null : card, multi: next });
          return;
        }
        // Dragging a card that is already in the group moves the whole group;
        // grabbing one outside it starts again from that card.
        const held = useUI.getState().multi;
        set({ drag: card, sel: card, multi: held.includes(card) ? held : [] });
        return;
      }

      // Shift-drag bands, plain drag pans. Panning cannot move to a modifier: the
      // wheel zooms here, so dragging is the only way to get around the board.
      if (e.shiftKey) {
        // Belt and braces with the CSS: drop anything already selected, so a
        // selection made before this board was opened cannot be dragged either.
        window.getSelection()?.removeAllRanges();
        const at = world();
        set({ drag: '__marquee', marquee: { x0: at.x, y0: at.y, x1: at.x, y1: at.y }, sel: null, multi: [] });
        return;
      }
      set({ drag: '__pan', sel: null, multi: [] });
    },
    [boardRect, set],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ui = useUI.getState();
      if (!ui.drag && !ui.link) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };

      if (ui.link) {
        const r = boardRect();
        set({
          ghost: {
            x: (e.clientX - r.left - ui.cam.x) / ui.cam.z,
            y: (e.clientY - r.top - ui.cam.y) / ui.cam.z,
          },
        });
        return;
      }
      if (ui.drag === '__pan') {
        panBy(dx, dy);
        return;
      }
      if (ui.drag === '__marquee' && ui.marquee) {
        const r = boardRect();
        const x1 = (e.clientX - r.left - ui.cam.x) / ui.cam.z;
        const y1 = (e.clientY - r.top - ui.cam.y) / ui.cam.z;
        const band = { ...ui.marquee, x1, y1 };
        // Touched, not enclosed: catching a card by clipping its corner is what
        // people expect from a band, and demanding full containment on a 244px
        // card means a lot of very careful dragging.
        const left = Math.min(band.x0, band.x1);
        const right = Math.max(band.x0, band.x1);
        const top = Math.min(band.y0, band.y1);
        const bottom = Math.max(band.y0, band.y1);
        const hit = useDoc.getState().pages
          .filter((p) => p.boardId === ui.boardId)
          .filter((p) => p.x < right && p.x + p.w > left && p.y < bottom && p.y + p.h > top)
          .map((p) => p.id);
        set({ marquee: band, multi: hit, sel: hit.length === 1 ? hit[0]! : null });
        return;
      }
      // Deltas divided by zoom, so the card stays under the cursor at any scale.
      const wx = dx / ui.cam.z + residual.current.x;
      const wy = dy / ui.cam.z + residual.current.y;
      const stepX = Math.round(wx);
      const stepY = Math.round(wy);
      residual.current = { x: wx - stepX, y: wy - stepY };
      if (ui.multi.length > 1 && ui.multi.includes(ui.drag!)) {
        useDoc.getState().movePages(ui.multi, stepX, stepY);
      } else {
        useDoc.getState().movePage(ui.drag!, stepX, stepY);
      }
    },
    [panBy, set],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const ui = useUI.getState();
      if (ui.link) {
        const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const to = under?.closest('[data-pid]')?.getAttribute('data-pid');
        if (to && to !== ui.link && useDoc.getState().addManualEdge(ui.link, to)) {
          const target = useDoc.getState().pages.find((p) => p.id === to);
          showToast(`Linked → ${target?.title ?? 'page'}`);
        }
        set({ link: null, ghost: null, drag: null });
        return;
      }
      // The band goes; what it caught stays.
      set({ drag: null, marquee: null });
    },
    [set, showToast],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!boardId) return;
      e.preventDefault();
      // Pointer capture retargets this event to the board, so hit-test the point.
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const card = under?.closest('[data-pid]')?.getAttribute('data-pid');
      if (card) {
        const held = useUI.getState().multi;
        set({
          sel: card,
          multi: held.includes(card) ? held : [],
          context: { x: e.clientX, y: e.clientY, target: { kind: 'page', id: card } },
        });
        return;
      }
      const r = boardRect();
      set({
        context: {
          x: e.clientX,
          y: e.clientY,
          target: {
            kind: 'canvas',
            id: boardId,
            world: {
              x: Math.round((e.clientX - r.left - cam.x) / cam.z - 122),
              y: Math.round((e.clientY - r.top - cam.y) / cam.z - 58),
            },
          },
        },
      });
    },
    [boardId, cam, set],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // The pointer capture taken on pointer-down retargets this event to the board,
      // so hit-test the point rather than trusting e.target.
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const card =
        under?.closest('[data-pid]')?.getAttribute('data-pid') ??
        (e.target as HTMLElement).closest('[data-pid]')?.getAttribute('data-pid');
      if (card) {
        const page = useDoc.getState().pages.find((p) => p.id === card);
        if (page) openPage(page.id, page.boardId);
        return;
      }
      if (!boardId) return;
      const r = boardRect();
      promptNew({
        kind: 'page',
        initial: suggestPageName(),
        boardId,
        at: {
          x: Math.round((e.clientX - r.left - cam.x) / cam.z - 122),
          y: Math.round((e.clientY - r.top - cam.y) / cam.z - 58),
        },
      });
    },
    [boardId, cam, openPage],
  );

  const ghostSource = link ? onBoard.get(link) : undefined;

  return (
    <div
      ref={el}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="board__grid" style={gridStyle(grid, cam.x, cam.y, cam.z)} />

      <div
        className="board__world"
        style={{ transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.z})` }}
      >
        {marquee && (
          <div
            className="board__marquee"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />
        )}

        {/* One oversized SVG offset by half its size so negative world coordinates draw. */}
        <svg className="board__svg" viewBox="0 0 12000 12000">
          <g transform="translate(6000,6000)">
            {drawnEdges.map((e) => (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={e.width}
                strokeDasharray={e.dash}
                opacity={e.opacity}
              />
            ))}
            {ghostSource && ghost && (
              <path
                d={(() => {
                  const from = ghostStart(ghostSource, ghost.x, ghost.y);
                  return `M${from.x} ${from.y} L${ghost.x} ${ghost.y}`;
                })()}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.6}
                strokeDasharray="5 4"
              />
            )}
          </g>
        </svg>

        {boardPages.map((page) => {
          const c = counts.get(page.id);
          return (
            <PageCard
              key={page.id}
              page={page}
              type={blockType(schema, page.type)}
              fields={pageFields(doc, page)}
              selected={page.id === sel || multi.includes(page.id)}
              depth={depth.get(page.id) ?? 0}
              outCount={c?.out ?? 0}
              inCount={c?.in ?? 0}
              offBoard={c?.off ?? 0}
              onEdit={() => openPage(page.id, page.boardId)}
            />
          );
        })}
      </div>

      {boardPages.length === 0 && (
        <div className="board__empty">
          <b>EMPTY BOARD</b>
          <span>Double-click anywhere to add a page</span>
        </div>
      )}

      <div className="board__overlay-tl" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="overlay-btn overlay-btn--accent"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            if (boardId) set({ newMenu: { boardId, left: Math.round(r.left), top: Math.round(r.bottom + 6) } });
          }}
        >
          + NEW ▾
        </button>
        {/* The first few types the project actually offers, in its own order — not a
            fixed list, so renaming, hiding or reordering in the schema shows up here. */}
        {creatableTypeKeys(schema).slice(0, 5).map((k) => (
          <button
            key={k}
            className="overlay-btn"
            style={{ color: blockType(schema, k).color }}
            title={`New ${blockType(schema, k).label.toLowerCase()}`}
            onClick={() =>
              boardId && promptNew({ kind: 'page', initial: suggestPageName(k), boardId, type: k })}
          >
            {blockType(schema, k).code}
          </button>
        ))}
      </div>

      <div className="board__overlay-br zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="overlay-btn"
          title={focus ? 'Leave full screen (Esc)' : 'Full screen — hide the rail and inspector (F)'}
          onClick={() => setFocus(!focus)}
        >
          {focus ? <Minimize size={13} strokeWidth={2.25} aria-hidden /> : <Maximize size={13} strokeWidth={2.25} aria-hidden />}
        </button>
        <button
          className="overlay-btn"
          title="Lay every card out in a grid, grouped by type"
          onClick={() => {
            if (!boardId) return;
            const moved = doc.arrangeBoard(boardId);
            // Fit afterwards from the store rather than from `boardPages`, which is
            // this render's copy and still holds the positions we just replaced.
            const r = boardRect();
            const after = useDoc.getState().pages.filter((p) => p.boardId === boardId);
            setCam(fitCamera(after, r.width, r.height));
            showToast(moved ? `Tidied ${moved} card${moved === 1 ? '' : 's'}` : 'Already tidy');
          }}
        >
          TIDY
        </button>
        <button className="overlay-btn" onClick={() => zoomAt(boardRect().width / 2, boardRect().height / 2, 0.85)}>–</button>
        <span className="overlay-btn zoom__value">{Math.round(cam.z * 100)}%</span>
        <button className="overlay-btn" onClick={() => zoomAt(boardRect().width / 2, boardRect().height / 2, 1.18)}>+</button>
        <button
          className="overlay-btn"
          onClick={() => {
            const r = boardRect();
            setCam(fitCamera(boardPages, r.width, r.height));
          }}
        >
          FIT
        </button>
      </div>
    </div>
  );
}
