import { schemaFor, useDoc } from './docStore';
import { useUI, type NamePrompt } from './uiStore';
import { rollDice } from './graph';
import { buildProjectFile, downloadProject, parseProjectFile } from '../lib/io';
import { uniqueTitle } from '../lib/text';
import { LIMITS, importImage } from '../lib/assets';
import type { PageImage } from './types';

/**
 * The board element, registered by <Board /> so actions raised elsewhere (the command
 * palette, the rail, a keyboard shortcut) can still place a page in the visible middle.
 */
let boardEl: HTMLElement | null = null;
export function registerBoard(el: HTMLElement | null): void {
  boardEl = el;
}
export function boardRect(): { left: number; top: number; width: number; height: number } {
  const r = boardEl?.getBoundingClientRect();
  return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: 900, height: 600 };
}

/** Centre of the viewport in world coordinates, nudged clear of anything already there. */
function freeSpot(boardId: string): { x: number; y: number } {
  const { cam } = useUI.getState();
  const { width, height } = boardRect();
  const spot = {
    x: Math.round((width / 2 - cam.x) / cam.z - 122),
    y: Math.round((height / 2 - cam.y) / cam.z - 58),
  };
  const pages = useDoc.getState().pages.filter((p) => p.boardId === boardId);
  for (let guard = 0; guard < 40; guard++) {
    const clash = pages.some((p) => Math.abs(p.x - spot.x) < 40 && Math.abs(p.y - spot.y) < 40);
    if (!clash) break;
    spot.x += 34;
    spot.y += 34;
  }
  return spot;
}

export interface CreatePageOptions {
  type?: string;
  boardId?: string;
  at?: { x: number; y: number };
  title?: string;
  /** Keep the page editor where it is — used when a slash command spawns a linked page. */
  keepEditor?: boolean;
}

/** Create a page and select it, opening the editor unless we are mid-edit. */
export function createPage(opts: CreatePageOptions = {}): string | null {
  const ui = useUI.getState();
  const boardId = opts.boardId ?? ui.boardId;
  if (!ui.projectId || !boardId) return null;

  const doc = useDoc.getState();
  const title = opts.title
    ? uniqueTitle(opts.title, doc.pages.filter((p) => p.projectId === ui.projectId).map((p) => p.title))
    : undefined;

  const id = doc.addPage({
    projectId: ui.projectId,
    boardId,
    ...(opts.type ? { type: opts.type } : {}),
    at: opts.at ?? freeSpot(boardId),
    ...(title ? { title } : {}),
  });

  if (opts.keepEditor) ui.set({ sel: id, boardId });
  else ui.set({ sel: id, boardId, editing: id, fieldsOpen: true, mode: 'board' });
  return id;
}

const ROLLING = 'cg-dice--rolling';
const LANDED = 'cg-dice--landed';
/** How long the die tumbles before it settles. */
const TUMBLE_MS = 620;
/** How long the total stays in place of the expression afterwards. */
const HOLD_MS = 1400;

/** Pending "put the expression back" timers, so a re-roll cancels the old one. */
const restores = new WeakMap<HTMLElement, number>();

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Cycle the token through plausible totals at a decelerating rate, then hand back to
 * `land`. The real result is decided before any of this runs — the tumble is show,
 * not chance — so what lands always matches what the toast says.
 */
function tumble(el: HTMLElement, expr: string, land: () => void): void {
  // Reset to the expression before measuring, and restore to it afterwards, rather
  // than to whatever the token currently reads: a click arriving while a previous
  // result is still on screen would otherwise adopt that number as the label and
  // keep it there for good. `expr` is the truth; the displayed text is not.
  const pending = restores.get(el);
  if (pending !== undefined) window.clearTimeout(pending);
  el.classList.remove(LANDED);
  el.style.minWidth = '';
  el.textContent = expr;

  // Lock the width: the expression and a bare total are different lengths, and a
  // token that resizes every frame reads as a glitch rather than a roll.
  el.style.minWidth = `${el.offsetWidth}px`;
  el.classList.add(ROLLING);

  const start = performance.now();
  let nextTick = 0;

  const step = (now: number) => {
    const t = (now - start) / TUMBLE_MS;
    if (t >= 1) {
      el.classList.remove(ROLLING);
      el.classList.add(LANDED);
      land();
      restores.set(
        el,
        window.setTimeout(() => {
          restores.delete(el);
          el.classList.remove(LANDED);
          el.style.minWidth = '';
          el.textContent = expr;
        }, HOLD_MS),
      );
      return;
    }
    if (now >= nextTick) {
      // Ticks stretch from 40ms to ~140ms across the tumble, so it slows to a stop.
      nextTick = now + 40 + t * t * 100;
      el.textContent = String(rollDice(expr)?.total ?? expr);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Roll a dice expression. Given the clicked token, the die tumbles there and settles
 * on the total; without one — or with reduced motion asked for — it just reports.
 */
export function rollAndToast(expr: string, el?: HTMLElement | null): void {
  const result = rollDice(expr);
  if (!result) return;
  const mod = result.mod ? (result.mod > 0 ? ` +${result.mod}` : ` ${result.mod}`) : '';
  const message = `${expr} → [${result.rolls.join(' ')}]${mod} = ${result.total}`;
  const show = () => useUI.getState().showToast(message);

  // A second click mid-roll would fight the first over the same text node.
  if (!el || el.classList.contains(ROLLING) || reducedMotion()) {
    show();
    return;
  }
  tumble(el, expr, () => {
    el.textContent = String(result.total);
    show();
  });
}

export function exportCurrentProject(): void {
  const { projectId, showToast } = useUI.getState();
  if (!projectId) return;
  const file = buildProjectFile(useDoc.getState(), projectId);
  if (!file) return;
  downloadProject(file);
  showToast(`Exported ${file.pages.length} pages as JSON`);
}

export async function importProjectFile(file: File): Promise<void> {
  const { showToast } = useUI.getState();
  const parsed = parseProjectFile(await file.text());
  if (!parsed) {
    showToast('Could not read that file');
    return;
  }
  const project = useDoc.getState().importProject(parsed);
  showToast(`Imported “${project.name}” with its own labels`);
}

/** Open a project on the first board of its first area. */
export function openProject(projectId: string): void {
  const doc = useDoc.getState();
  const area = doc.areas.find((a) => a.projectId === projectId);
  const board = area ? doc.boards.find((b) => b.areaId === area.id) : undefined;
  useUI.getState().openProject(projectId, area?.id ?? null, board?.id ?? null);
}

export function createProject(): void {
  const id = useDoc.getState().addProject();
  openProject(id);
}

export function createArea(name?: string): void {
  const ui = useUI.getState();
  if (!ui.projectId) return;
  const id = useDoc.getState().addArea(ui.projectId, name);
  const board = useDoc.getState().boards.find((b) => b.areaId === id);
  ui.set({ areaId: id, boardId: board?.id ?? null, mode: 'area', sel: null });
}

/** Add a board to an area and open its canvas. */
export function createBoard(areaId?: string, name?: string): void {
  const ui = useUI.getState();
  const target = areaId ?? ui.areaId;
  if (!ui.projectId || !target) return;
  const id = useDoc.getState().addBoard(ui.projectId, target, name);
  ui.openBoard(id, target);
}

/**
 * Ask for a name before creating. Only for the paths where a person is starting
 * something new — the slash command, wikilink autocomplete and unresolved-link
 * flows already know the title and go straight to createPage.
 */
export function promptNew(prompt: NamePrompt): void {
  useUI.getState().set({ prompt, context: null, newMenu: null });
}

/**
 * Suggest a starting name for a new page. With no type given, resolve the one the
 * page will actually get — the current board's area default — so the suggestion
 * matches what gets created.
 */
export function suggestPageName(type?: string): string {
  const ui = useUI.getState();
  const doc = useDoc.getState();

  let key = type;
  if (!key) {
    const board = doc.boards.find((b) => b.id === ui.boardId);
    key = doc.areas.find((a) => a.id === board?.areaId)?.defaultType;
  }
  if (!key || key === 'blank') return 'New page';

  const schema = schemaFor(doc, ui.projectId);
  return `New ${(schema.types[key]?.label ?? 'page').toLowerCase()}`;
}

/** The block type lookup for the project currently open. */
export function currentTypes() {
  return schemaFor(useDoc.getState(), useUI.getState().projectId);
}

/* ---------- images ---------- */

/**
 * Import dropped, pasted or picked files onto a page and report what happened.
 * Every failure is a toast rather than a throw: half a drop landing is better than
 * none, and the user needs to know which half.
 */
export async function attachImages(pageId: string, files: Iterable<File>): Promise<PageImage[]> {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (list.length === 0) return [];

  const { showToast } = useUI.getState();
  const accepted: PageImage[] = [];
  const refused: string[] = [];
  for (const file of list) {
    const result = await importImage(file);
    if (result.ok) accepted.push(result.image);
    else refused.push(result.reason);
  }

  const overflow = accepted.length ? useDoc.getState().addPageImages(pageId, accepted) : 0;
  if (overflow > 0) {
    refused.push(`Only ${LIMITS.maxPerPage} images fit on a page`);
    accepted.length -= overflow;
  }

  if (refused[0]) showToast(refused.length === 1 ? refused[0] : `${refused.length} images refused — ${refused[0]}`);
  else if (accepted.length) showToast(`Added ${accepted.length} image${accepted.length > 1 ? 's' : ''}`);
  return accepted;
}
