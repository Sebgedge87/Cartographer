import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  Area, BlockType, Board, Doc, Edge, Field, FieldKind, Page, PageImage, Project, ProjectFile, ProjectSchema,
} from './types';
import { deriveWikiEdges, effectiveFields, isCustomPage } from './graph';
import { codeFor, emptyDoc, normaliseSchema, starterSchema } from './defaults';
import { debounce, loadDoc, saveDoc, throttleLeading } from '../lib/persist';
import { LIMITS, sweepAssets } from '../lib/assets';

export const CARD_W = 244;
export const CARD_H = 116;

export function uid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}

const FALLBACK_TYPE: BlockType = { label: 'Note', code: 'NT', color: '#8a919e', fields: [] };

interface DocActions {
  hydrate: (doc: Doc) => void;
  applyRemote: (doc: Doc) => void;

  addProject: () => string;
  renameProject: (id: string, name: string) => void;
  importProject: (file: ProjectFile) => Project;

  addArea: (projectId: string, name?: string) => string;
  renameArea: (id: string, name: string) => void;
  setAreaDefaultType: (id: string, type: string) => void;
  deleteArea: (id: string) => void;

  addBoard: (projectId: string, areaId: string, name?: string) => string;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => void;

  addPage: (opts: {
    projectId: string;
    boardId: string;
    type?: string;
    at: { x: number; y: number };
    title?: string;
  }) => string;
  patchPage: (id: string, patch: Partial<Page>) => void;
  movePage: (id: string, dx: number, dy: number) => void;
  setPageField: (pageId: string, field: Field, value: string) => void;
  deletePage: (id: string) => void;
  /** Copy a page onto the same board, offset so it does not land under the original. */
  duplicatePage: (id: string) => string | null;

  /** Attach imported images. Returns how many were refused for hitting the per-page cap. */
  addPageImages: (pageId: string, images: PageImage[]) => number;
  /** Drop the ref. The bytes are swept at the next boot, so this stays undoable. */
  removePageImage: (pageId: string, assetId: string) => void;
  /** Choose the image shown on the card and at the top of the inspector. */
  setHeaderImage: (pageId: string, assetId: string | null) => void;

  setCustom: (pageId: string, fn: (fields: Field[]) => Field[]) => void;
  addElement: (pageId: string, kind: FieldKind) => void;
  moveElement: (pageId: string, index: number, dir: -1 | 1) => void;
  promoteType: (pageId: string) => { key: string; label: string } | null;

  addType: (projectId: string) => void;
  renameType: (projectId: string, key: string, label: string) => void;
  setTypeHidden: (projectId: string, key: string, hidden: boolean) => void;
  moveType: (projectId: string, key: string, dir: -1 | 1) => void;
  /** Refuses while any page still uses the type; returns false if nothing was deleted. */
  deleteType: (projectId: string, key: string) => boolean;
  addTypeField: (projectId: string, key: string, field?: Field) => void;
  patchTypeField: (projectId: string, key: string, index: number, patch: Partial<Field>) => void;
  deleteTypeField: (projectId: string, key: string, index: number) => void;

  addManualEdge: (from: string, to: string) => boolean;
}

export type DocStore = Doc & DocActions;

const EMPTY: Doc = { projects: [], areas: [], boards: [], pages: [], edges: [], schemas: {} };

/** Recompute the 'field' edges owned by one page from its current ref values. */
function reFieldEdges(page: Page, fields: Field[], edges: Edge[]): Edge[] {
  const kept = edges.filter((e) => !(e.kind === 'field' && e.from === page.id));
  const refs = fields
    .filter((f) => f.kind === 'ref')
    .map((f) => page.fields[f.key])
    .filter((v): v is string => !!v);
  return kept.concat(refs.map((to) => ({ id: `r:${page.id}:${to}`, from: page.id, to, kind: 'field' as const })));
}

function withSchema(state: Doc, projectId: string, fn: (s: ProjectSchema) => ProjectSchema): Partial<Doc> {
  const current = state.schemas[projectId] ?? starterSchema();
  return { schemas: { ...state.schemas, [projectId]: fn(current) } };
}

export const useDoc = create<DocStore>()(
  temporal(
    (set, get) => ({
      ...EMPTY,

      hydrate: (doc) => set(doc),

      /**
       * Write a synced document in. Paused history: a change another machine made
       * is not something the user can meaningfully undo here, and recording it
       * would let one press throw away the merge.
       */
      applyRemote: (doc) => {
        const history = useDoc.temporal.getState();
        history.pause();
        try {
          set(doc);
        } finally {
          history.resume();
        }
      },

      /* ---------- projects ---------- */
      addProject: () => {
        const id = uid('p');
        const areaId = uid('a');
        const boardId = uid('b');
        set((s) => ({
          projects: [...s.projects, { id, name: 'New project', system: 'Untitled', accent: '#8fa5c9' }],
          areas: [...s.areas, { id: areaId, projectId: id, name: 'Notes', defaultType: 'note' }],
          // A page needs a board and a board needs an area, so a new project comes
          // with one of each rather than an empty shell you cannot add to.
          boards: [...s.boards, { id: boardId, projectId: id, areaId, name: 'First board' }],
          schemas: { ...s.schemas, [id]: starterSchema() },
        }));
        return id;
      },

      renameProject: (id, name) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) })),

      importProject: (file) => {
        const project: Project = file.project ?? {
          id: uid('p'), name: 'Imported', system: 'Imported', accent: '#8fa5c9',
        };
        const schema = normaliseSchema({
          types: file.types ?? starterSchema().types,
          typeOrder: file.typeOrder ?? starterSchema().typeOrder,
        });
        set((s) => {
          const pages = [...s.pages, ...(file.pages ?? [])];
          // A file exported before boards existed carries pages hung off areas, so
          // it goes through the same migration as a stored document.
          const merged = migrate({
            projects: [...s.projects, project],
            areas: [...s.areas, ...(file.areas ?? [])],
            boards: [...s.boards, ...(file.boards ?? [])],
            pages,
            edges: deriveWikiEdges(pages, [...s.edges, ...(file.links ?? []).filter((e) => e.kind !== 'wiki')]),
            schemas: { ...s.schemas, [project.id]: schema },
          });
          return merged;
        });
        return project;
      },

      /* ---------- areas ---------- */
      addArea: (projectId, name) => {
        const id = uid('a');
        const area: Area = { id, projectId, name: name ?? 'New area', defaultType: 'note' };
        const board: Board = { id: uid('b'), projectId, areaId: id, name: 'First board' };
        set((s) => ({ areas: [...s.areas, area], boards: [...s.boards, board] }));
        return id;
      },

      renameArea: (id, name) =>
        set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, name } : a)) })),

      setAreaDefaultType: (id, defaultType) =>
        set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, defaultType } : a)) })),

      /** Deleting an area deletes its boards, their pages, and every edge touching them. */
      deleteArea: (id) =>
        set((s) => {
          const boardIds = new Set(s.boards.filter((b) => b.areaId === id).map((b) => b.id));
          const doomed = new Set(s.pages.filter((p) => boardIds.has(p.boardId)).map((p) => p.id));
          return {
            areas: s.areas.filter((a) => a.id !== id),
            boards: s.boards.filter((b) => b.areaId !== id),
            pages: s.pages.filter((p) => !boardIds.has(p.boardId)),
            edges: s.edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to)),
          };
        }),

      /* ---------- boards ---------- */

      addBoard: (projectId, areaId, name) => {
        const id = uid('b');
        set((s) => ({
          boards: [...s.boards, { id, projectId, areaId, name: name ?? 'New board' }],
        }));
        return id;
      },

      renameBoard: (id, name) =>
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),

      /** Deleting a board deletes its pages and every edge that touched them. */
      deleteBoard: (id) =>
        set((s) => {
          const doomed = new Set(s.pages.filter((p) => p.boardId === id).map((p) => p.id));
          return {
            boards: s.boards.filter((b) => b.id !== id),
            pages: s.pages.filter((p) => p.boardId !== id),
            edges: s.edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to)),
          };
        }),

      /* ---------- pages ---------- */
      addPage: ({ projectId, boardId, type, at, title }) => {
        const s = get();
        const board = s.boards.find((b) => b.id === boardId);
        const area = s.areas.find((a) => a.id === board?.areaId);
        const typeKey = type ?? area?.defaultType ?? 'note';
        const schema = s.schemas[projectId] ?? starterSchema();
        const blockType = schema.types[typeKey] ?? FALLBACK_TYPE;
        const id = uid('n');
        const page: Page = {
          id, projectId, boardId, type: typeKey,
          title: title ?? (typeKey === 'blank' ? 'Untitled page' : `Untitled ${blockType.label}`),
          x: at.x, y: at.y, w: CARD_W, h: CARD_H,
          fields: {}, custom: typeKey === 'blank' ? [] : null, cols: 0,
          body: '', images: [], header: null, updated: Date.now(),
        };
        set((st) => {
          const pages = [...st.pages, page];
          return { pages, edges: deriveWikiEdges(pages, st.edges) };
        });
        return id;
      },

      patchPage: (id, patch) =>
        set((s) => {
          const pages = s.pages.map((p) => (p.id === id ? { ...p, ...patch, updated: Date.now() } : p));
          return { pages, edges: deriveWikiEdges(pages, s.edges) };
        }),

      /** Drag deltas only — never absolute positions, so a drag stays locked at any zoom. */
      movePage: (id, dx, dy) =>
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === id ? { ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) } : p,
          ),
        })),

      setPageField: (pageId, field, value) =>
        set((s) => {
          const pages = s.pages.map((p) =>
            p.id === pageId ? { ...p, fields: { ...p.fields, [field.key]: value }, updated: Date.now() } : p,
          );
          if (field.kind !== 'ref') return { pages };
          const page = pages.find((p) => p.id === pageId);
          if (!page) return { pages };
          const schema = s.schemas[page.projectId] ?? starterSchema();
          const fields = effectiveFields(page, (schema.types[page.type] ?? FALLBACK_TYPE).fields);
          return { pages, edges: reFieldEdges(page, fields, s.edges) };
        }),

      duplicatePage: (id) => {
        const source = get().pages.find((p) => p.id === id);
        if (!source) return null;

        // Step the copy clear of anything already on the board. A fixed offset put
        // it almost on top of the original, hiding the thing you just copied.
        const siblings = get().pages.filter((p) => p.boardId === source.boardId);
        const spot = { x: source.x + 32, y: source.y + 32 };
        for (let guard = 0; guard < 40; guard++) {
          const clash = siblings.some((p) => Math.abs(p.x - spot.x) < 40 && Math.abs(p.y - spot.y) < 40);
          if (!clash) break;
          spot.x += 34;
          spot.y += 34;
        }

        const copy: Page = {
          ...source,
          id: uid('n'),
          title: `${source.title} copy`,
          x: spot.x,
          y: spot.y,
          fields: { ...source.fields },
          custom: source.custom ? source.custom.map((f) => ({ ...f })) : null,
          updated: Date.now(),
        };
        set((s) => {
          const pages = [...s.pages, copy];
          return { pages, edges: deriveWikiEdges(pages, s.edges) };
        });
        return copy.id;
      },

      deletePage: (id) =>
        set((s) => ({
          pages: s.pages.filter((p) => p.id !== id),
          edges: s.edges.filter((e) => e.from !== id && e.to !== id),
        })),

      /* ---------- images ---------- */
      addPageImages: (pageId, images) => {
        const page = get().pages.find((p) => p.id === pageId);
        if (!page || images.length === 0) return images.length;
        const room = Math.max(0, LIMITS.maxPerPage - page.images.length);
        const taken = images.slice(0, room);
        if (taken.length === 0) return images.length;
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  images: [...p.images, ...taken],
                  // The first image a page gets is its header. Anything after that is
                  // a deliberate choice, so we do not move it out from under the user.
                  header: p.header ?? taken[0]?.id ?? null,
                  updated: Date.now(),
                }
              : p,
          ),
        }));
        return images.length - taken.length;
      },

      removePageImage: (pageId, assetId) =>
        set((s) => ({
          pages: s.pages.map((p) => {
            if (p.id !== pageId) return p;
            const images = p.images.filter((i) => i.id !== assetId);
            return {
              ...p,
              images,
              // Losing the header promotes whatever is left rather than leaving the
              // card blank while the page still has pictures.
              header: p.header === assetId ? (images[0]?.id ?? null) : p.header,
              updated: Date.now(),
            };
          }),
        })),

      setHeaderImage: (pageId, assetId) =>
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId && (assetId === null || p.images.some((i) => i.id === assetId))
              ? { ...p, header: assetId, updated: Date.now() }
              : p,
          ),
        })),

      /* ---------- per-page custom layouts ---------- */
      setCustom: (pageId, fn) =>
        set((s) => ({
          pages: s.pages.map((p) => {
            if (p.id !== pageId) return p;
            const schema = s.schemas[p.projectId] ?? starterSchema();
            const base = Array.isArray(p.custom)
              ? p.custom.map((f) => ({ ...f }))
              : (schema.types[p.type] ?? FALLBACK_TYPE).fields.map((f) => ({ ...f }));
            return { ...p, custom: fn(base), updated: Date.now() };
          }),
        })),

      addElement: (pageId, kind) => {
        const labels: Record<FieldKind, string> = {
          text: 'Label', number: 'Number', long: 'Notes', ref: 'Link', heading: 'Section',
        };
        get().setCustom(pageId, (fields) =>
          fields.concat([{
            key: 'f' + Math.random().toString(36).slice(2, 7),
            label: labels[kind],
            kind,
            wide: kind === 'long' || kind === 'heading',
          }]),
        );
      },

      moveElement: (pageId, index, dir) =>
        get().setCustom(pageId, (fields) => {
          const j = index + dir;
          const a = fields[index];
          const b = fields[j];
          if (!a || !b) return fields;
          const next = fields.slice();
          next[index] = b;
          next[j] = a;
          return next;
        }),

      /** Promote a page's hand-built layout into a reusable project block type. */
      promoteType: (pageId) => {
        const page = get().pages.find((p) => p.id === pageId);
        if (!page) return null;
        const key = 't' + Math.random().toString(36).slice(2, 6);
        const fields = (page.custom ?? []).filter((f) => f.kind !== 'heading');
        const code = ((page.title || '').replace(/[^A-Za-z]/g, '') || 'XX').slice(0, 2).toUpperCase();
        const label = page.title && !page.title.startsWith('Untitled') ? page.title : 'New type';
        set((s) => ({
          ...withSchema(s, page.projectId, (schema) => ({
            types: { ...schema.types, [key]: { label, code, color: '#8fa5c9', fields } },
            typeOrder: [...schema.typeOrder.filter((k) => k !== 'blank'), key, 'blank'],
          })),
          pages: s.pages.map((p) => (p.id === pageId ? { ...p, type: key, custom: null } : p)),
        }));
        return { key, label };
      },

      /* ---------- project schema ---------- */
      addType: (projectId) => {
        const key = 'custom' + Math.random().toString(36).slice(2, 5);
        set((s) =>
          withSchema(s, projectId, (schema) => ({
            types: {
              ...schema.types,
              [key]: {
                label: 'New type', code: codeFor('New type'), color: '#8fa5c9',
                fields: [{ key: 'f1', label: 'Field', kind: 'text' }],
              },
            },
            typeOrder: [...schema.typeOrder.filter((k) => k !== 'blank'), key, 'blank'],
          })),
        );
      },

      // The tag follows the label. It is not editable on its own, so leaving it
      // behind on a rename would strand a type called Region wearing LOC.
      renameType: (projectId, key, label) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            if (!t) return schema;
            return {
              ...schema,
              types: { ...schema.types, [key]: { ...t, label, code: codeFor(label) } },
            };
          }),
        ),

      setTypeHidden: (projectId, key, hidden) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            if (!t) return schema;
            return { ...schema, types: { ...schema.types, [key]: { ...t, hidden } } };
          }),
        ),

      /** Reorder within the visible list; 'blank' is pinned last and never moves. */
      moveType: (projectId, key, dir) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const order = schema.typeOrder.filter((k) => k !== 'blank');
            const i = order.indexOf(key);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= order.length) return schema;
            const next = order.slice();
            next[i] = order[j]!;
            next[j] = key;
            return { ...schema, typeOrder: [...next, 'blank'] };
          }),
        ),

      deleteType: (projectId, key) => {
        if (key === 'blank') return false;
        const inUse = get().pages.some((p) => p.projectId === projectId && p.type === key);
        if (inUse) return false;
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const types = { ...schema.types };
            delete types[key];
            return { types, typeOrder: schema.typeOrder.filter((k) => k !== key) };
          }),
        );
        return true;
      },

      addTypeField: (projectId, key, field) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            if (!t) return schema;
            const next = field ?? { key: 'f' + Math.random().toString(36).slice(2, 6), label: 'New field', kind: 'text' as const };
            return { ...schema, types: { ...schema.types, [key]: { ...t, fields: [...t.fields, next] } } };
          }),
        ),

      patchTypeField: (projectId, key, index, patch) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            const f = t?.fields[index];
            if (!t || !f) return schema;
            const fields = t.fields.slice();
            fields[index] = { ...f, ...patch };
            return { ...schema, types: { ...schema.types, [key]: { ...t, fields } } };
          }),
        ),

      deleteTypeField: (projectId, key, index) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            if (!t) return schema;
            return {
              ...schema,
              types: { ...schema.types, [key]: { ...t, fields: t.fields.filter((_, i) => i !== index) } },
            };
          }),
        ),

      /* ---------- edges ---------- */
      addManualEdge: (from, to) => {
        if (from === to) return false;
        if (get().edges.some((e) => e.from === from && e.to === to)) return false;
        set((s) => ({ edges: [...s.edges, { id: `m:${from}:${to}`, from, to, kind: 'manual' }] }));
        return true;
      },
    }),
    {
      limit: 60,
      // Undo/redo only ever moves documents; ephemeral UI lives in its own store.
      partialize: ({ projects, areas, boards, pages, edges, schemas }) =>
        ({ projects, areas, boards, pages, edges, schemas }),
      // Leading-edge, so a burst of keystrokes or a drag records the state from
      // *before* the burst — one undo steps over the whole edit, not one character.
      handleSet: (record) => throttleLeading(record, 500),
    },
  ),
);

/* ---------- selectors ---------- */

export function schemaFor(doc: Doc, projectId: string | null): ProjectSchema {
  if (!projectId) return starterSchema();
  return doc.schemas[projectId] ?? starterSchema();
}

export function blockType(schema: ProjectSchema, key: string): BlockType {
  return schema.types[key] ?? schema.types.note ?? FALLBACK_TYPE;
}

/**
 * Type keys offered when creating a page: in the project's own order, minus
 * 'blank' (which the new-page menu lists separately) and minus anything hidden.
 */
export function creatableTypeKeys(schema: ProjectSchema): string[] {
  return schema.typeOrder.filter((k) => k !== 'blank' && schema.types[k] && !schema.types[k]!.hidden);
}

/**
 * Options for a type <select>. Hidden types stay out of the list, except the one
 * already selected — dropping that would silently retype the page.
 */
export function typeOptions(schema: ProjectSchema, current?: string): { key: string; label: string }[] {
  return schema.typeOrder
    .filter((k) => schema.types[k] && (!schema.types[k]!.hidden || k === current))
    .map((k) => ({ key: k, label: schema.types[k]!.label }));
}

/** The fields a page renders, resolved against its project's schema. */
export function pageFields(doc: Doc, page: Page): Field[] {
  const schema = schemaFor(doc, page.projectId);
  return effectiveFields(page, blockType(schema, page.type).fields);
}

export { isCustomPage };

/* ---------- boot + autosave ---------- */

/** A page from before boards existed: it referenced its area directly. */
type LegacyPage = Page & { areaId?: string };

/**
 * Bring a stored document up to the area -> board -> page hierarchy.
 *
 * Documents written before boards existed hung pages straight off an area. Each
 * such area becomes an area containing one board of the same name, and its pages
 * move onto that board — so an existing project opens looking exactly as it did,
 * one level deeper.
 */
export function migrate(doc: Doc): Doc {
  // Images arrived after v1 shipped, so every page gets the fields whether or not
  // the rest of this migration has anything to do.
  const withImages = doc.pages.some((p) => !Array.isArray(p.images) || p.header === undefined)
    ? {
        ...doc,
        pages: doc.pages.map((p) => ({
          ...p,
          images: Array.isArray(p.images) ? p.images : [],
          header: p.header ?? null,
        })),
      }
    : doc;

  if (!withImages.pages.some((p) => !p.boardId)) return withImages;
  doc = withImages;

  const boards = [...doc.boards];
  const boardForArea = new Map<string, string>();
  for (const b of boards) {
    if (!boardForArea.has(b.areaId)) boardForArea.set(b.areaId, b.id);
  }

  for (const area of doc.areas) {
    if (boardForArea.has(area.id)) continue;
    const id = `b:${area.id}`;
    boards.push({ id, projectId: area.projectId, areaId: area.id, name: area.name });
    boardForArea.set(area.id, id);
  }

  const pages = doc.pages.map((page) => {
    if (page.boardId) return page;
    const legacy = page as LegacyPage;
    const boardId = legacy.areaId ? boardForArea.get(legacy.areaId) : undefined;
    const { areaId: _dropped, ...rest } = legacy;
    return { ...rest, boardId: boardId ?? boards[0]?.id ?? '' } as Page;
  });

  // Anything that still has no board would be unreachable, so drop it rather than
  // leave orphans the UI can never show.
  const boardIds = new Set(boards.map((b) => b.id));
  const kept = pages.filter((p) => boardIds.has(p.boardId));
  const keptIds = new Set(kept.map((p) => p.id));

  return {
    ...doc,
    boards,
    pages: kept,
    edges: doc.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to)),
  };
}

let hydrated = false;

/** Load the stored document, or start empty, and keep writing it back. */
export async function bootDoc(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const stored = await loadDoc<Partial<Doc>>();
  const doc: Doc = stored?.pages
    ? migrate({
        projects: stored.projects ?? [],
        areas: stored.areas ?? [],
        boards: stored.boards ?? [],
        pages: stored.pages,
        edges: stored.edges ?? [],
        schemas: stored.schemas ?? {},
      })
    : emptyDoc();

  // Every project must have a schema, and every schema must have 'blank'.
  const schemas: Record<string, ProjectSchema> = {};
  for (const p of doc.projects) schemas[p.id] = normaliseSchema(doc.schemas[p.id] ?? starterSchema());
  doc.schemas = schemas;

  useDoc.getState().hydrate(doc);
  useDoc.temporal.getState().clear();

  // History is empty at this point, so an unreferenced blob cannot be undone back
  // into use. This is the one safe moment to free them.
  void sweepAssets(doc.pages.flatMap((p) => p.images.map((i) => i.id)));

  const write = debounce((d: Doc) => void saveDoc(d), 400);
  useDoc.subscribe(({ projects, areas, boards, pages, edges, schemas: sc }) =>
    write({ projects, areas, boards, pages, edges, schemas: sc }),
  );
}
