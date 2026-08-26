import type { Edge, Field, Page } from './types';

export const ZOOM_MIN = 0.28;
export const ZOOM_MAX = 2.2;

const WIKI = /\[\[([^\]]+)\]\]/g;

/**
 * Recompute 'wiki' edges for every page from its body text, preserving
 * 'manual' and 'field' edges. Titles match case-insensitively.
 *
 * Call this after any change to a page's body or title.
 */
export function deriveWikiEdges(pages: Page[], existing: Edge[]): Edge[] {
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p.id]));
  const kept = existing.filter((e) => e.kind !== 'wiki');
  const seen = new Set<string>();
  const wiki: Edge[] = [];

  for (const page of pages) {
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

/** The fields a page actually renders: its own layout if it has one, else its type's. */
export function effectiveFields(page: Page, typeFields: Field[]): Field[] {
  return page.custom ?? typeFields;
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
 * Edge path between two cards: right edge -> left edge, or bottom -> top when the
 * target sits to the left. Control offset max(48, |dx| / 2).
 */
export function edgePath(a: Page, b: Page): string {
  let x1 = a.x + a.w;
  let y1 = a.y + a.h / 2;
  let x2 = b.x;
  let y2 = b.y + b.h / 2;
  if (x2 < x1) {
    x1 = a.x + a.w / 2;
    y1 = a.y + a.h;
    x2 = b.x + b.w / 2;
    y2 = b.y;
  }
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`;
}

/** Roll a dice expression like 2d6+3. Caps at 20 dice. */
export function rollDice(expr: string): { rolls: number[]; mod: number; total: number } | null {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(expr);
  if (!m) return null;
  const n = Math.min(parseInt(m[1] || '1', 10), 20);
  const sides = parseInt(m[2]!, 10);
  const mod = parseInt(m[3] || '0', 10);
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return { rolls, mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}
