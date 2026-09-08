import type { Area, Board, Doc, Page, Project, ProjectFile } from '../state/types';

export const FORMAT = 'cartographer/v1';

/** Everything one project needs to travel on its own: pages, links and its schema. */
export function buildProjectFile(doc: Doc, projectId: string): ProjectFile | null {
  const project = doc.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const pages = doc.pages.filter((p) => p.projectId === projectId);
  const ids = new Set(pages.map((p) => p.id));
  const schema = doc.schemas[projectId];
  return {
    format: FORMAT,
    project,
    areas: doc.areas.filter((a) => a.projectId === projectId),
    boards: doc.boards.filter((b) => b.projectId === projectId),
    pages,
    types: schema?.types ?? {},
    typeOrder: schema?.typeOrder ?? [],
    calendar: schema?.calendar,
    dictionary: schema?.dictionary ?? [],
    links: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}

export function slug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase() || 'project';
}

function download(name: string, body: string, type: string): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadProject(file: ProjectFile): void {
  download(
    `${slug(file.project.name)}.cartographer.json`,
    JSON.stringify(file, null, 2),
    'application/json',
  );
}

/** The readable export: for printing, sharing, or reading in any other tool. */
export function downloadMarkdown(name: string, body: string): void {
  download(`${slug(name)}.md`, body, 'text/markdown');
}

/* ---------- import ---------- */

/** Card size, duplicated from the store so this file stays free of it. */
const CARD_W = 244;
const CARD_H = 116;
/** Cards per row when a hand-written file gives no coordinates. */
const COLUMNS = 4;

let counter = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Fill in everything a hand-written page leaves out.
 *
 * The export writes every field, but a file typed by hand to bring some existing
 * notes in will not: it will have a title and a body and stop there. Everything
 * else has an answer that is obviously right, and demanding them all would make
 * the format hostile to the one job an importer has.
 */
function completePage(raw: Partial<Page>, projectId: string, boardId: string, type: string, index: number): Page {
  // Laid out in a grid when no position is given, so pages do not stack on the
  // origin and have to be dragged apart one at a time.
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const cols = num(raw.cols, 0);
  return {
    id: str(raw.id, nextId('n')),
    projectId,
    boardId: str(raw.boardId, boardId),
    type: str(raw.type, type),
    title: str(raw.title, 'Untitled'),
    x: num(raw.x, 120 + column * (CARD_W + 56)),
    y: num(raw.y, 120 + row * (CARD_H + 84)),
    w: num(raw.w, CARD_W),
    h: num(raw.h, CARD_H),
    fields: raw.fields && typeof raw.fields === 'object' ? raw.fields : {},
    custom: Array.isArray(raw.custom) ? raw.custom : null,
    cols: (cols >= 0 && cols <= 4 ? Math.round(cols) : 0) as Page['cols'],
    body: str(raw.body, ''),
    images: Array.isArray(raw.images) ? raw.images : [],
    header: typeof raw.header === 'string' ? raw.header : null,
    updated: num(raw.updated, Date.now()),
  };
}

/**
 * A `ref` field holds the id of the page it points at, which is a miserable thing
 * to write by hand. So a value that is not an id but does match a page title is
 * swapped for that page's id — the file can say "The Nine Sightless" and mean it.
 * Ambiguity is left alone: two pages with the same title have no right answer.
 */
function resolveRefs(pages: Page[], types: ProjectFile['types']): void {
  const ids = new Set(pages.map((p) => p.id));
  const byTitle = new Map<string, string | null>();
  for (const page of pages) {
    byTitle.set(page.title, byTitle.has(page.title) ? null : page.id);
  }
  for (const page of pages) {
    for (const field of types[page.type]?.fields ?? []) {
      if (field.kind !== 'ref') continue;
      const value = page.fields[field.key];
      if (!value || ids.has(value)) continue;
      const match = byTitle.get(value);
      if (match) page.fields[field.key] = match;
    }
  }
}

/**
 * Parse an imported file, rejecting anything that is not a project export.
 *
 * `pages` is the only part that must be there. Everything else is filled in, so the
 * smallest file that works is a format, a name and a list of titles — see
 * `templates/` for one written that way and one written in full.
 */
export function parseProjectFile(raw: string): ProjectFile | null {
  try {
    const data = JSON.parse(raw) as Partial<ProjectFile>;
    if (!data || !Array.isArray(data.pages)) return null;

    const project: Project = {
      id: str(data.project?.id, nextId('p')),
      name: str(data.project?.name, 'Imported'),
      system: str(data.project?.system, ''),
      accent: str(data.project?.accent, '#8fa5c9'),
    };

    // A page needs a board and a board needs an area, so a file that gives neither
    // gets one of each rather than importing into nothing.
    const areas: Area[] = (data.areas ?? []).map((a, i) => ({
      id: str(a?.id, nextId('a')),
      projectId: project.id,
      name: str(a?.name, `Area ${i + 1}`),
      defaultType: str(a?.defaultType, 'note'),
    }));
    if (areas.length === 0) {
      areas.push({ id: nextId('a'), projectId: project.id, name: 'Notes', defaultType: 'note' });
    }

    const boards: Board[] = (data.boards ?? []).map((b, i) => ({
      id: str(b?.id, nextId('b')),
      projectId: project.id,
      areaId: str(b?.areaId, areas[0]!.id),
      name: str(b?.name, `Board ${i + 1}`),
    }));
    if (boards.length === 0) {
      boards.push({ id: nextId('b'), projectId: project.id, areaId: areas[0]!.id, name: project.name });
    }

    const byId = new Map(boards.map((b) => [b.id, b]));
    const defaultType = (boardId: string) =>
      areas.find((a) => a.id === byId.get(boardId)?.areaId)?.defaultType ?? 'note';

    const pages = data.pages.map((page, i) => {
      const boardId = str(page?.boardId, boards[0]!.id);
      return completePage(page ?? {}, project.id, boardId, defaultType(boardId), i);
    });

    resolveRefs(pages, data.types ?? {});

    const ids = new Set(pages.map((p) => p.id));
    return {
      format: FORMAT,
      project,
      areas,
      boards,
      pages,
      types: data.types ?? {},
      typeOrder: data.typeOrder ?? [],
      calendar: data.calendar,
      dictionary: Array.isArray(data.dictionary) ? data.dictionary : [],
      // Links to pages the file does not contain would be edges to nothing.
      links: (data.links ?? []).filter((e) => e && ids.has(e.from) && ids.has(e.to)),
    };
  } catch {
    return null;
  }
}
