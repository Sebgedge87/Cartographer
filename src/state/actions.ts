import { schemaFor, useDoc } from './docStore';
import { useUI } from './uiStore';
import { rollDice } from './graph';
import { buildProjectFile, downloadProject, parseProjectFile } from '../lib/io';
import { uniqueTitle } from '../lib/text';

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
function freeSpot(areaId: string): { x: number; y: number } {
  const { cam } = useUI.getState();
  const { width, height } = boardRect();
  const spot = {
    x: Math.round((width / 2 - cam.x) / cam.z - 122),
    y: Math.round((height / 2 - cam.y) / cam.z - 58),
  };
  const pages = useDoc.getState().pages.filter((p) => p.areaId === areaId);
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
  areaId?: string;
  at?: { x: number; y: number };
  title?: string;
  /** Keep the page editor where it is — used when a slash command spawns a linked page. */
  keepEditor?: boolean;
}

/** Create a page and select it, opening the editor unless we are mid-edit. */
export function createPage(opts: CreatePageOptions = {}): string | null {
  const ui = useUI.getState();
  const areaId = opts.areaId ?? ui.areaId;
  if (!ui.projectId || !areaId) return null;

  const doc = useDoc.getState();
  const title = opts.title
    ? uniqueTitle(opts.title, doc.pages.filter((p) => p.projectId === ui.projectId).map((p) => p.title))
    : undefined;

  const id = doc.addPage({
    projectId: ui.projectId,
    areaId,
    ...(opts.type ? { type: opts.type } : {}),
    at: opts.at ?? freeSpot(areaId),
    ...(title ? { title } : {}),
  });

  if (opts.keepEditor) ui.set({ sel: id, areaId });
  else ui.set({ sel: id, areaId, editing: id, fieldsOpen: true, mode: 'board' });
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

/** Open a project on its first area. */
export function openProject(projectId: string): void {
  const first = useDoc.getState().areas.find((a) => a.projectId === projectId);
  useUI.getState().openProject(projectId, first?.id ?? null);
}

export function createProject(): void {
  const id = useDoc.getState().addProject();
  openProject(id);
}

export function createArea(): void {
  const ui = useUI.getState();
  if (!ui.projectId) return;
  const id = useDoc.getState().addArea(ui.projectId);
  ui.set({ areaId: id, mode: 'board', sel: null });
  ui.showToast('Area added — rename it in the rail');
}

/** The block type lookup for the project currently open. */
export function currentTypes() {
  return schemaFor(useDoc.getState(), useUI.getState().projectId);
}
