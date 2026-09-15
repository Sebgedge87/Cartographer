import type { SupabaseClient } from '@supabase/supabase-js';
import type { AreaRow, BlockType, BoardRow, EdgeRow, PageRow, ProjectRow } from './rows.js';
import { CARD_H, CARD_W, newId } from './rows.js';
import { effectiveFields, labelledFields, mapFieldValues } from './fields.js';

/**
 * What Claude can do with a Cartographer project.
 *
 * Every call goes through the caller's own Supabase session, so row-level security
 * is what decides what is visible — this layer adds no access of its own and can
 * only ever reach the signed-in user's projects.
 *
 * The tools are written for someone thinking out loud about a game, not for a
 * database client: pages are named by title where a title is unambiguous, fields
 * are named by their labels, and the orienting call (`describe_project`) returns
 * the whole shape of a project in one go so the rest can be used without guessing.
 */

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  /** True for anything that changes the document, so a transport can gate them. */
  writes: boolean;
  run: (db: SupabaseClient, args: Record<string, unknown>) => Promise<unknown>;
}

/* ---------- helpers ---------- */

class ToolError extends Error {}

function str(args: Record<string, unknown>, key: string, fallback?: string): string {
  const v = args[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (fallback !== undefined) return fallback;
  throw new ToolError(`"${key}" is required.`);
}

function optionalStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function strings(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
}

function record(args: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const v = args[key];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

/**
 * Run a PostgREST query and hand back its rows, turning an error into something a
 * caller can read. Typed loosely on the way in because narrowing a select() changes
 * the builder's own row type, and the shape we want back is the one named at the
 * call site.
 */
async function take<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new ToolError(error.message);
  return (data ?? []) as T;
}

/** The project to act on: the one named, or the only one there is. */
async function resolveProject(db: SupabaseClient, args: Record<string, unknown>): Promise<ProjectRow> {
  const projects = await take<ProjectRow[]>(db.from('projects').select('*'));
  if (!projects.length) throw new ToolError('There are no projects in this account yet.');
  const wanted = optionalStr(args, 'project');
  if (!wanted) {
    if (projects.length === 1) return projects[0]!;
    throw new ToolError(
      `Several projects exist — say which: ${projects.map((p) => p.name).join(', ')}.`,
    );
  }
  const low = wanted.toLowerCase();
  const hit = projects.find((p) => p.id === wanted)
    ?? projects.find((p) => p.name.toLowerCase() === low)
    ?? projects.find((p) => p.name.toLowerCase().includes(low));
  if (!hit) throw new ToolError(`No project called "${wanted}". There is: ${projects.map((p) => p.name).join(', ')}.`);
  return hit;
}

/** A page by id, or by title within the project when the title names exactly one. */
async function resolvePage(db: SupabaseClient, projectId: string, wanted: string): Promise<PageRow> {
  const pages = await take<PageRow[]>(db.from('pages').select('*').eq('project_id', projectId));
  const byId = pages.find((p) => p.id === wanted);
  if (byId) return byId;
  const low = wanted.trim().toLowerCase();
  const exact = pages.filter((p) => p.title.trim().toLowerCase() === low);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new ToolError(`"${wanted}" names ${exact.length} pages. Use the id: ${exact.map((p) => p.id).join(', ')}.`);
  }
  const loose = pages.filter((p) => p.title.toLowerCase().includes(low));
  if (loose.length === 1) return loose[0]!;
  if (loose.length > 1) {
    throw new ToolError(`"${wanted}" could be: ${loose.slice(0, 8).map((p) => p.title).join(', ')}.`);
  }
  throw new ToolError(`No page called "${wanted}" in this project.`);
}

function typeOf(project: ProjectRow, key: string): BlockType | undefined {
  return project.types?.[key];
}

/** Resolve a block type by key or by its label, the way someone would name it. */
function resolveType(project: ProjectRow, wanted: string | undefined): string {
  const types = project.types ?? {};
  if (!wanted) return types['blank'] ? 'blank' : Object.keys(types)[0] ?? 'blank';
  const low = wanted.trim().toLowerCase();
  if (types[wanted]) return wanted;
  for (const [key, t] of Object.entries(types)) {
    if (key.toLowerCase() === low || t.label.trim().toLowerCase() === low) return key;
  }
  throw new ToolError(
    `No block type "${wanted}". This project has: ${Object.values(types).map((t) => t.label).join(', ')}.`,
  );
}

/** Somewhere clear on the board to drop a new card. */
function freeSpot(onBoard: PageRow[]): { x: number; y: number } {
  if (!onBoard.length) return { x: 120, y: 120 };
  const lowest = Math.max(...onBoard.map((p) => p.y + (p.h || CARD_H)));
  return { x: 120, y: lowest + 84 };
}

const now = () => Date.now();

/* ---------- reading ---------- */

const listProjects: ToolDef = {
  name: 'list_projects',
  title: 'List projects',
  description:
    'Every project in this account, with how much is in each. Start here when you do not know what exists.',
  inputSchema: { type: 'object', properties: {} },
  writes: false,
  run: async (db) => {
    const [projects, pages] = await Promise.all([
      take<ProjectRow[]>(db.from('projects').select('*')),
      take<PageRow[]>(db.from('pages').select('id,project_id')),
    ]);
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      system: p.system === 'Untitled' ? null : p.system,
      pages: pages.filter((page) => page.project_id === p.id).length,
    }));
  },
};

const describeProject: ToolDef = {
  name: 'describe_project',
  title: 'Describe a project',
  description:
    'The whole shape of a project in one call: its areas and the boards inside them, every block type with '
    + 'the fields it defines, and the tags in use. Read this before creating or editing anything — it is what '
    + 'tells you which board a page can go on, which types exist, and what fields they carry.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
  },
  writes: false,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const [areas, boards, pages] = await Promise.all([
      take<AreaRow[]>(db.from('areas').select('*').eq('project_id', project.id)),
      take<BoardRow[]>(db.from('boards').select('*').eq('project_id', project.id)),
      take<PageRow[]>(db.from('pages').select('*').eq('project_id', project.id)),
    ]);
    const tags = new Set<string>();
    for (const page of pages) for (const tag of page.tags ?? []) tags.add(tag);

    return {
      id: project.id,
      name: project.name,
      system: project.system === 'Untitled' ? null : project.system,
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        defaultType: area.default_type,
        boards: boards
          .filter((b) => b.area_id === area.id)
          .map((b) => ({
            id: b.id,
            name: b.name,
            pages: pages.filter((p) => p.board_id === b.id).length,
          })),
      })),
      blockTypes: Object.entries(project.types ?? {})
        .filter(([, t]) => !t.hidden)
        .map(([key, t]) => ({
          key,
          label: t.label,
          fields: t.fields.map((f) => ({
            label: f.label,
            kind: f.kind,
            ...(f.options ? { choices: f.options } : {}),
          })),
        })),
      tagsInUse: [...tags].sort(),
    };
  },
};

const listPages: ToolDef = {
  name: 'list_pages',
  title: 'List pages',
  description:
    'Pages in a project, optionally narrowed to one board, one block type, or one tag. Returns titles and ids '
    + 'rather than whole pages — follow up with read_page for the ones you want.',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
      board: { type: 'string', description: 'Board name or id.' },
      type: { type: 'string', description: 'Block type label or key, e.g. "Creature".' },
      tag: { type: 'string', description: 'Only pages carrying this tag.' },
    },
  },
  writes: false,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const [boards, pages] = await Promise.all([
      take<BoardRow[]>(db.from('boards').select('*').eq('project_id', project.id)),
      take<PageRow[]>(db.from('pages').select('*').eq('project_id', project.id)),
    ]);
    const boardName = optionalStr(args, 'board');
    const board = boardName
      ? boards.find((b) => b.id === boardName)
        ?? boards.find((b) => b.name.toLowerCase() === boardName.toLowerCase())
      : undefined;
    if (boardName && !board) {
      throw new ToolError(`No board called "${boardName}". There is: ${boards.map((b) => b.name).join(', ')}.`);
    }
    const typeKey = optionalStr(args, 'type') ? resolveType(project, optionalStr(args, 'type')) : undefined;
    const tag = optionalStr(args, 'tag')?.toLowerCase();

    return pages
      .filter((p) => (!board || p.board_id === board.id)
        && (!typeKey || p.type === typeKey)
        && (!tag || (p.tags ?? []).some((t) => t.toLowerCase() === tag)))
      .map((p) => ({
        id: p.id,
        title: p.title,
        type: typeOf(project, p.type)?.label ?? p.type,
        board: boards.find((b) => b.id === p.board_id)?.name ?? p.board_id,
        tags: p.tags ?? [],
      }));
  },
};

const readPage: ToolDef = {
  name: 'read_page',
  title: 'Read a page',
  description:
    'One page in full: its field values by label, its body, its tags, and the pages it links to and from.',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', description: 'Page title or id.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['page'],
  },
  writes: false,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const page = await resolvePage(db, project.id, str(args, 'page'));
    const [edges, pages] = await Promise.all([
      take<EdgeRow[]>(db.from('edges').select('*').eq('project_id', project.id)),
      take<PageRow[]>(db.from('pages').select('id,title').eq('project_id', project.id)),
    ]);
    const title = (id: string) => pages.find((p) => p.id === id)?.title ?? id;

    return {
      id: page.id,
      title: page.title,
      type: typeOf(project, page.type)?.label ?? page.type,
      tags: page.tags ?? [],
      fields: labelledFields(page, typeOf(project, page.type)),
      body: page.body,
      linksTo: edges.filter((e) => e.from_page === page.id).map((e) => title(e.to_page)),
      linkedFrom: edges.filter((e) => e.to_page === page.id).map((e) => title(e.from_page)),
    };
  },
};

const searchPages: ToolDef = {
  name: 'search',
  title: 'Search a project',
  description:
    'Find pages by any text written on them — title, tags, field values or body. Case-insensitive substring, '
    + 'the same match the app\'s own search box uses.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['query'],
  },
  writes: false,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const q = str(args, 'query').toLowerCase();
    const pages = await take<PageRow[]>(db.from('pages').select('*').eq('project_id', project.id));

    const hits: { id: string; title: string; where: string; excerpt: string }[] = [];
    for (const page of pages) {
      const type = typeOf(project, page.type);
      const at = (text: string) => text.toLowerCase().indexOf(q);
      const excerpt = (text: string, i: number) =>
        text.slice(Math.max(0, i - 40), i + q.length + 40).replace(/\s+/g, ' ').trim();

      const inTitle = at(page.title);
      if (inTitle >= 0) { hits.push({ id: page.id, title: page.title, where: 'title', excerpt: page.title }); continue; }
      const tag = (page.tags ?? []).find((t) => t.toLowerCase().includes(q));
      if (tag) { hits.push({ id: page.id, title: page.title, where: 'tag', excerpt: tag }); continue; }
      let found = false;
      for (const field of effectiveFields(page, type)) {
        const value = page.fields[field.key];
        const i = value ? at(value) : -1;
        if (i >= 0) {
          hits.push({ id: page.id, title: page.title, where: field.label, excerpt: excerpt(value!, i) });
          found = true;
          break;
        }
      }
      if (found) continue;
      const inBody = at(page.body);
      if (inBody >= 0) hits.push({ id: page.id, title: page.title, where: 'body', excerpt: excerpt(page.body, inBody) });
    }
    return hits;
  },
};

/* ---------- writing ---------- */

const createPage: ToolDef = {
  name: 'create_page',
  title: 'Create a page',
  description:
    'Add a page to a board. Name the board and the block type as they appear in describe_project. Field values '
    + 'are given by label. The page appears in the app on its next sync.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The page title.' },
      board: { type: 'string', description: 'Board name or id to put it on.' },
      type: { type: 'string', description: 'Block type label, e.g. "Creature". Defaults to a blank page.' },
      body: { type: 'string', description: 'Markdown body. [[Page Title]] links to another page.' },
      fields: { type: 'object', description: 'Field values keyed by label, e.g. {"Hit points": "31"}.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags to carry.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['title', 'board'],
  },
  writes: true,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const boards = await take<BoardRow[]>(db.from('boards').select('*').eq('project_id', project.id));
    const wanted = str(args, 'board');
    const board = boards.find((b) => b.id === wanted)
      ?? boards.find((b) => b.name.toLowerCase() === wanted.toLowerCase())
      ?? boards.find((b) => b.name.toLowerCase().includes(wanted.toLowerCase()));
    if (!board) {
      throw new ToolError(`No board called "${wanted}". There is: ${boards.map((b) => b.name).join(', ')}.`);
    }

    const typeKey = resolveType(project, optionalStr(args, 'type'));
    const type = typeOf(project, typeKey);
    const given = record(args, 'fields') ?? {};
    const { values, unknown } = mapFieldValues(type?.fields ?? [], given);

    const onBoard = await take<PageRow[]>(db.from('pages').select('*').eq('board_id', board.id));
    const at = freeSpot(onBoard);
    const row: PageRow = {
      id: newId('n'),
      project_id: project.id,
      board_id: board.id,
      type: typeKey,
      title: str(args, 'title'),
      x: at.x, y: at.y, w: CARD_W, h: CARD_H,
      fields: values,
      custom: null,
      cols: 0,
      body: optionalStr(args, 'body') ?? '',
      tags: strings(args, 'tags') ?? [],
      images: [],
      header: null,
      updated: now(),
    };
    await take(db.from('pages').insert(row).select());

    return {
      created: { id: row.id, title: row.title, type: type?.label ?? typeKey, board: board.name },
      ...(unknown.length
        ? { warning: `These named no field on a ${type?.label ?? typeKey} and were not written: ${unknown.join(', ')}.` }
        : {}),
    };
  },
};

const updatePage: ToolDef = {
  name: 'update_page',
  title: 'Update a page',
  description:
    'Change a page. Only what you pass is touched — omit a property to leave it as it is. Field values given '
    + 'by label are merged into the existing ones; tags replace the list wholesale.',
  inputSchema: {
    type: 'object',
    properties: {
      page: { type: 'string', description: 'Page title or id.' },
      title: { type: 'string', description: 'A new title.' },
      body: { type: 'string', description: 'Replaces the markdown body.' },
      append: { type: 'string', description: 'Markdown added to the end of the body instead of replacing it.' },
      fields: { type: 'object', description: 'Field values keyed by label; merged, not replaced.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Replaces the tag list.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['page'],
  },
  writes: true,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const page = await resolvePage(db, project.id, str(args, 'page'));
    const type = typeOf(project, page.type);

    const patch: Partial<PageRow> = { updated: now() };
    const title = optionalStr(args, 'title');
    if (title) patch.title = title;

    const body = typeof args['body'] === 'string' ? (args['body'] as string) : undefined;
    const append = optionalStr(args, 'append');
    if (body !== undefined) patch.body = body;
    if (append) patch.body = `${body ?? page.body}${(body ?? page.body).trim() ? '\n\n' : ''}${append}`;

    let unknown: string[] = [];
    const given = record(args, 'fields');
    if (given) {
      const mapped = mapFieldValues(effectiveFields(page, type), given);
      unknown = mapped.unknown;
      patch.fields = { ...page.fields, ...mapped.values };
    }
    const tags = strings(args, 'tags');
    if (tags) patch.tags = tags;

    await take(db.from('pages').update(patch).eq('id', page.id).select());
    return {
      updated: { id: page.id, title: patch.title ?? page.title },
      changed: Object.keys(patch).filter((k) => k !== 'updated'),
      ...(unknown.length
        ? { warning: `These named no field on this page and were not written: ${unknown.join(', ')}.` }
        : {}),
    };
  },
};

const linkPages: ToolDef = {
  name: 'link_pages',
  title: 'Link two pages',
  description:
    'Draw a link from one page to another, the same link dragging between two cards makes. Direction matters: '
    + 'the board reads it as containment, so link a region to the settlements inside it, not the other way.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'The page the link starts at, by title or id.' },
      to: { type: 'string', description: 'The page it points at, by title or id.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['from', 'to'],
  },
  writes: true,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const from = await resolvePage(db, project.id, str(args, 'from'));
    const to = await resolvePage(db, project.id, str(args, 'to'));
    if (from.id === to.id) throw new ToolError('A page cannot link to itself.');

    const existing = await take<EdgeRow[]>(
      db.from('edges').select('*').eq('project_id', project.id).eq('from_page', from.id).eq('to_page', to.id),
    );
    if (existing.length) return { alreadyLinked: { from: from.title, to: to.title } };

    const row: EdgeRow = {
      id: newId('e'),
      project_id: project.id,
      from_page: from.id,
      to_page: to.id,
      kind: 'manual',
      updated: now(),
    };
    await take(db.from('edges').insert(row).select());
    return { linked: { from: from.title, to: to.title } };
  },
};

const createBoard: ToolDef = {
  name: 'create_board',
  title: 'Create a board',
  description:
    'Add a board to an area. A board is one subject and one canvas; pages live on boards, never on areas.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The board name.' },
      area: { type: 'string', description: 'Area name or id to put it in.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['name', 'area'],
  },
  writes: true,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const areas = await take<AreaRow[]>(db.from('areas').select('*').eq('project_id', project.id));
    const wanted = str(args, 'area');
    const area = areas.find((a) => a.id === wanted)
      ?? areas.find((a) => a.name.toLowerCase() === wanted.toLowerCase())
      ?? areas.find((a) => a.name.toLowerCase().includes(wanted.toLowerCase()));
    if (!area) {
      throw new ToolError(`No area called "${wanted}". There is: ${areas.map((a) => a.name).join(', ')}.`);
    }
    const row: BoardRow = {
      id: newId('b'),
      project_id: project.id,
      area_id: area.id,
      name: str(args, 'name'),
      updated: now(),
    };
    await take(db.from('boards').insert(row).select());
    return { created: { id: row.id, name: row.name, area: area.name } };
  },
};

const createArea: ToolDef = {
  name: 'create_area',
  title: 'Create an area',
  description:
    'Add an area — a category such as Locations, NPCs or Rules — together with its first board, since an area '
    + 'with no board has nowhere to put a page.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The area name.' },
      board: { type: 'string', description: 'Name for its first board. Defaults to the area name.' },
      defaultType: { type: 'string', description: 'Block type new pages default to here.' },
      project: { type: 'string', description: 'Project name or id. Optional when there is only one.' },
    },
    required: ['name'],
  },
  writes: true,
  run: async (db, args) => {
    const project = await resolveProject(db, args);
    const name = str(args, 'name');
    const area: AreaRow = {
      id: newId('a'),
      project_id: project.id,
      name,
      default_type: resolveType(project, optionalStr(args, 'defaultType')),
      updated: now(),
    };
    await take(db.from('areas').insert(area).select());
    const board: BoardRow = {
      id: newId('b'),
      project_id: project.id,
      area_id: area.id,
      name: optionalStr(args, 'board') ?? name,
      updated: now(),
    };
    await take(db.from('boards').insert(board).select());
    return { created: { area: area.name, board: board.name, boardId: board.id } };
  },
};

export const TOOLS: ToolDef[] = [
  listProjects,
  describeProject,
  listPages,
  readPage,
  searchPages,
  createPage,
  updatePage,
  linkPages,
  createBoard,
  createArea,
];

export { ToolError };
