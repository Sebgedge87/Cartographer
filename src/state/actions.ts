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

export function rollAndToast(expr: string): void {
  const result = rollDice(expr);
  if (!result) return;
  const mod = result.mod ? (result.mod > 0 ? ` +${result.mod}` : ` ${result.mod}`) : '';
  useUI.getState().showToast(`${expr} → [${result.rolls.join(' ')}]${mod} = ${result.total}`);
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
