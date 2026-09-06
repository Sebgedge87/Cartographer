import type { Camera, Edge, Field, Page } from './types';

export const ZOOM_MIN = 0.28;
export const ZOOM_MAX = 2.2;

const WIKI = /\[\[([^\]]+)\]\]/g;

/** Page ids by lower-cased title, scoped to one project so links never cross projects. */
export function titleIndex(pages: Page[], projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of pages) {
    if (p.projectId === projectId) map.set(p.title.toLowerCase(), p.id);
  }
  return map;
}

/**
 * Recompute 'wiki' edges for every page from its body text, preserving
 * 'manual' and 'field' edges. Titles match case-insensitively, within a project.
 *
 * Call this after any change to a page's body or title.
 */
export function deriveWikiEdges(pages: Page[], existing: Edge[]): Edge[] {
  const byProject = new Map<string, Map<string, string>>();
  for (const p of pages) {
    let m = byProject.get(p.projectId);
    if (!m) byProject.set(p.projectId, (m = new Map()));
    m.set(p.title.toLowerCase(), p.id);
  }
  const kept = existing.filter((e) => e.kind !== 'wiki');
  const seen = new Set<string>();
  const wiki: Edge[] = [];

  for (const page of pages) {
    const byTitle = byProject.get(page.projectId);
    if (!byTitle) continue;
    WIKI.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI.exec(page.body))) {
      const to = byTitle.get(m[1]!.trim().toLowerCase());
      if (!to || to === page.id) continue;
      const id = `w:${page.id}:${to}`;
      if (seen.has(id)) continue;
      seen.add(id);
      wiki.push({ id, from: page.id, to, kind: 'wiki' });
    }
  }
  return [...kept, ...wiki];
}

/**
 * Rebuild the whole edge list from authored 'manual' edges plus everything derivable.
 *
 * Only manual edges are ever stored remotely — wiki and field edges are a pure
 * function of page bodies and ref values, so syncing them would mean writing rows
 * on every keystroke and re-deriving them on read anyway.
 */
export function deriveAllEdges(
  pages: Page[],
  fieldsOf: (page: Page) => Field[],
  existing: Edge[],
): Edge[] {
  const manual = existing.filter((e) => e.kind === 'manual');
  let edges = deriveWikiEdges(pages, manual);
  for (const page of pages) edges = deriveFieldEdges(page, fieldsOf(page), edges);
  return edges;
}

/** Recompute 'field' edges for one page from its 'ref' field values. */
export function deriveFieldEdges(page: Page, fields: Field[], existing: Edge[]): Edge[] {
  const kept = existing.filter((e) => !(e.kind === 'field' && e.from === page.id));
  const refs = fields
    .filter((f) => f.kind === 'ref')
    .map((f) => page.fields[f.key])
    .filter((v): v is string => !!v);
  return [
    ...kept,
    ...refs.map((to) => ({ id: `r:${page.id}:${to}`, from: page.id, to, kind: 'field' as const })),
  ];
}

/**
 * A page carries its own layout when it is blank or has been forked off its type.
 * Those pages are edited with the element builder rather than the type's schema.
 */
export function isCustomPage(page: Page | undefined): boolean {
  return !!page && (page.type === 'blank' || Array.isArray(page.custom));
}

/** The fields a page actually renders: its own layout if it has one, else its type's. */
export function effectiveFields(page: Page, typeFields: Field[]): Field[] {
  return isCustomPage(page) ? page.custom ?? [] : typeFields;
}

/** Screen point -> world point. Deltas during a drag must be divided by cam.z. */
export function toWorld(px: number, py: number, cam: { x: number; y: number; z: number }) {
  return { x: (px - cam.x) / cam.z, y: (py - cam.y) / cam.z };
}

/** Zoom about a screen-space anchor, keeping that point fixed. */
export function zoomAt(cam: { x: number; y: number; z: number }, px: number, py: number, factor: number) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.z * factor));
  const k = z / cam.z;
  return { x: px - (px - cam.x) * k, y: py - (py - cam.y) * k, z };
}

/**
 * A stable 0..1 value from a string. Same edge, same wobble, every render — so the
 * board looks hand-drawn rather than animated by accident.
 */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Where a ray from a card's centre leaves its rectangle, nudged just clear of the border. */
function perimeterPoint(
  cx: number, cy: number, hw: number, hh: number, dx: number, dy: number, pad = 3,
): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: cx + hw, y: cy };
  // Scale the direction until it touches whichever edge it reaches first.
  const scale = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + dx * scale + (dx / len) * pad, y: cy + dy * scale + (dy / len) * pad };
}

/**
 * Edge path between two cards.
 *
 * Lines leave each card from the side that actually faces the other, then bow
 * across the gap rather than turning square corners. The bow is perpendicular to
 * the chord, scaled to distance and varied per edge from a hash of its id, and the
 * two control points differ slightly so no two arcs are congruent — a rigid,
 * identical S-curve on every link is what makes a board read as a flowchart.
 *
 * This deliberately departs from SPEC.md's right-edge -> left-edge routing.
 */
export function edgePath(a: Page, b: Page, seed = ''): string {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;

  const start = perimeterPoint(ax, ay, a.w / 2, a.h / 2, bx - ax, by - ay);
  const end = perimeterPoint(bx, by, b.w / 2, b.h / 2, ax - bx, ay - by);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return `M${start.x} ${start.y} L${end.x} ${end.y}`;

  // Perpendicular to the chord, which is the direction the curve bellies out in.
  const px = -dy / len;
  const py = dx / len;

  const r = hash01(seed || `${a.id}:${b.id}`);
  const direction = r < 0.5 ? 1 : -1;
  // Curvature ramps in with distance: neighbouring cards get a gentle lean, long
  // spans get a real arc so they still read as drawn rather than ruled. Without the
  // ramp a short link between two stacked cards balloons into a lens shape.
  const ramp = 0.45 + 0.55 * Math.min(1, len / 500);
  const bow = Math.min(len * (0.11 + r * 0.07) * ramp, 132) * direction;

  // Asymmetric control points: the belly sits slightly past the midpoint.
  const c1x = start.x + dx * 0.32 + px * bow;
  const c1y = start.y + dy * 0.32 + py * bow;
  const c2x = start.x + dx * 0.68 + px * bow * 0.82;
  const c2y = start.y + dy * 0.68 + py * bow * 0.82;

  const n = (v: number) => Math.round(v * 10) / 10;
  return `M${n(start.x)} ${n(start.y)} C${n(c1x)} ${n(c1y)},${n(c2x)} ${n(c2y)},${n(end.x)} ${n(end.y)}`;
}

/** Where an in-progress link should leave its source card, given the cursor. */
export function ghostStart(a: Page, toX: number, toY: number): { x: number; y: number } {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  return perimeterPoint(cx, cy, a.w / 2, a.h / 2, toX - cx, toY - cy);
}

/** Camera that frames every page in `pages`, or the default view when there are none. */
export function fitCamera(pages: Page[], width: number, height: number): Camera {
  if (!pages.length) return { x: 260, y: 180, z: 1 };
  const minX = Math.min(...pages.map((p) => p.x)) - 60;
  const minY = Math.min(...pages.map((p) => p.y)) - 60;
  const maxX = Math.max(...pages.map((p) => p.x + p.w)) + 60;
  const maxY = Math.max(...pages.map((p) => p.y + p.h)) + 60;
  const z = Math.min(1.4, width / (maxX - minX), height / (maxY - minY));
  return {
    x: -minX * z + (width - (maxX - minX) * z) / 2,
    y: -minY * z + (height - (maxY - minY) * z) / 2,
    z,
  };
}

/** Roll a dice expression like 2d6+3. Caps at 20 dice. */
export function rollDice(expr: string): { rolls: number[]; sides: number; mod: number; total: number } | null {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(expr);
  if (!m) return null;
  const n = Math.min(parseInt(m[1] || '1', 10), 20);
  const sides = parseInt(m[2]!, 10);
  const mod = parseInt(m[3] || '0', 10);
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return { rolls, sides, mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

/* ---------- board layout ---------- */

/** Card size and the gaps between, so a tidied board has room for its links. */
const CARD_W = 244;
const CARD_H = 116;
const PITCH_X = CARD_W + 56;
const PITCH_Y = CARD_H + 84;
/** Clear of the canvas origin, and the gap between one tree and the next. */
const ORIGIN = 120;
const TREE_GAP = 1;

/**
 * Where every card on a board should sit, laid out as a cascading hierarchy.
 *
 * A setting is not a flat list. A region holds its sub-regions, a city its
 * districts, a faction its people — and the board already records which, because a
 * page that links out to a thing is almost always the thing that contains it. So
 * links are followed in the direction they were written: whatever nothing points
 * at goes on top, what it links to on the row beneath, their links on the row
 * after, cascading down.
 *
 * Parents sit centred over their children, which is what makes the shape readable
 * rather than merely ordered. Separate trees stand side by side. Pages with no
 * links at all cannot cascade, so they are packed into a block underneath instead
 * of each claiming a column of their own.
 *
 * Deterministic throughout — every tie breaks on type order, then title, then id —
 * so a board tidies to the same picture every time, and tidying twice does nothing.
 */
export function arrangeLayout(
  pages: Page[],
  edges: Edge[],
  rank: (type: string) => number,
): Map<string, { x: number; y: number }> {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out = new Map<string, Set<string>>(pages.map((p) => [p.id, new Set<string>()]));
  const into = new Map<string, Set<string>>(pages.map((p) => [p.id, new Set<string>()]));
  const near = new Map<string, Set<string>>(pages.map((p) => [p.id, new Set<string>()]));
  for (const edge of edges) {
    // Both ends have to be on this board; a link off it says nothing about where
    // either page belongs here.
    if (!byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) continue;
    out.get(edge.from)!.add(edge.to);
    into.get(edge.to)!.add(edge.from);
    near.get(edge.from)!.add(edge.to);
    near.get(edge.to)!.add(edge.from);
  }

  const children = (id: string) => out.get(id) ?? new Set<string>();
  /** How much a page contains, which is what decides who leads a cluster. */
  const compare = (a: Page, b: Page) =>
    children(b.id).size - children(a.id).size
    || rank(a.type) - rank(b.type)
    // Numeric, so "Session 2" comes before "Session 10" rather than after it:
    // titles in a setting are numbered far more often than not.
    || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    || a.id.localeCompare(b.id);

  /**
   * A page nothing links to is the top of its hierarchy. Where a cluster is a ring
   * — everything pointed at by something — there is no top, so the page that holds
   * the most stands in for one.
   */
  const roots = [...pages].sort((a, b) => {
    const rootish = (p: Page) => (into.get(p.id)!.size === 0 ? 0 : 1);
    return rootish(a) - rootish(b) || compare(a, b);
  });

  const seen = new Set<string>();
  const placed = new Map<string, { x: number; y: number }>();
  /** Columns the trees have used so far, counted in card widths. */
  let usedColumns = 0;
  let deepestRow = 0;
  const loose: Page[] = [];

  for (const root of roots) {
    if (seen.has(root.id)) continue;
    seen.add(root.id);

    // Down the links first. Anything in the cluster the arrows never reach is
    // picked up afterwards, hung off whichever placed page it touches.
    const depth = new Map<string, number>([[root.id, 0]]);
    const kids = new Map<string, string[]>();
    const order: string[] = [];
    const queue = [root.id];
    for (let pass = 0; pass < 2; pass++) {
      while (queue.length) {
        const id = queue.shift()!;
        order.push(id);
        const next = [...(pass === 0 ? children(id) : near.get(id) ?? [])]
          .filter((n) => !seen.has(n))
          .map((n) => byId.get(n)!)
          .sort(compare);
        kids.set(id, [...(kids.get(id) ?? []), ...next.map((p) => p.id)]);
        for (const child of next) {
          seen.add(child.id);
          depth.set(child.id, depth.get(id)! + 1);
          queue.push(child.id);
        }
      }
      // Second pass only where the arrows left something behind.
      const stranded = order.filter((id) => [...(near.get(id) ?? [])].some((n) => !seen.has(n)));
      if (!stranded.length) break;
      queue.push(...stranded);
      order.length = 0;
      const revisit = new Set(stranded);
      for (const id of revisit) depth.set(id, depth.get(id)!);
    }

    if (order.length === 1 && children(root.id).size === 0 && near.get(root.id)!.size === 0) {
      loose.push(root);
      continue;
    }

    /*
     * Columns, depth first: walk down the left edge of the tree, give each page
     * with no children the next free column, and centre every parent over the
     * children it just placed.
     *
     * Depth first is what keeps a family together. Sorting by depth instead —
     * every leaf in the tree before every parent — sends a childless page to the
     * far right of the whole board, past its own siblings' grandchildren, and
     * leaves a hole where it should have been.
     */
    const column = new Map<string, number>();
    let nextLeaf = 0;
    const stack: { id: string; entered: boolean }[] = [{ id: root.id, entered: false }];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const mine = kids.get(frame.id) ?? [];
      if (!frame.entered) {
        frame.entered = true;
        if (mine.length === 0) {
          column.set(frame.id, nextLeaf++);
          stack.pop();
          continue;
        }
        // Reversed, because a stack hands them back in the opposite order.
        for (let i = mine.length - 1; i >= 0; i--) stack.push({ id: mine[i]!, entered: false });
        continue;
      }
      const xs = mine.map((k) => column.get(k)!).filter((n) => n !== undefined);
      column.set(frame.id, xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : nextLeaf++);
      stack.pop();
    }

    for (const id of depth.keys()) {
      const row = depth.get(id)!;
      deepestRow = Math.max(deepestRow, row);
      placed.set(id, {
        x: Math.round(ORIGIN + (usedColumns + column.get(id)!) * PITCH_X),
        y: ORIGIN + row * PITCH_Y,
      });
    }
    usedColumns += nextLeaf + TREE_GAP;
  }

  if (loose.length) {
    // A block rather than a row: thirty-eight unlinked pages in a line would
    // stretch the canvas much further than the trees they sit beneath.
    const cols = Math.max(1, Math.ceil(Math.sqrt(loose.length)));
    const top = ORIGIN + (placed.size ? deepestRow + 1 : 0) * PITCH_Y;
    loose.sort(compare).forEach((page, i) => {
      placed.set(page.id, {
        x: ORIGIN + (i % cols) * PITCH_X,
        y: top + Math.floor(i / cols) * PITCH_Y,
      });
    });
  }

  return placed;
}
