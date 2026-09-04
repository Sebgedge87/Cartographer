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
