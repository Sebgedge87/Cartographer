import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  Area, BlockType, Doc, Edge, Field, FieldKind, Page, Project, ProjectFile, ProjectSchema,
} from './types';
import { deriveWikiEdges, effectiveFields, isCustomPage } from './graph';
import { normaliseSchema, seed, starterSchema } from './seed';
import { debounce, loadDoc, saveDoc, throttleLeading } from '../lib/persist';

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

  addArea: (projectId: string) => string;
  renameArea: (id: string, name: string) => void;
  setAreaDefaultType: (id: string, type: string) => void;
  deleteArea: (id: string) => void;

  addPage: (opts: {
    projectId: string;
    areaId: string;
    type?: string;
    at: { x: number; y: number };
    title?: string;
  }) => string;
  patchPage: (id: string, patch: Partial<Page>) => void;
  movePage: (id: string, dx: number, dy: number) => void;
  setPageField: (pageId: string, field: Field, value: string) => void;
  deletePage: (id: string) => void;

  setCustom: (pageId: string, fn: (fields: Field[]) => Field[]) => void;
  addElement: (pageId: string, kind: FieldKind) => void;
  moveElement: (pageId: string, index: number, dir: -1 | 1) => void;
  promoteType: (pageId: string) => { key: string; label: string } | null;

  addType: (projectId: string) => void;
  renameType: (projectId: string, key: string, label: string) => void;
  addTypeField: (projectId: string, key: string, field?: Field) => void;
  patchTypeField: (projectId: string, key: string, index: number, patch: Partial<Field>) => void;
  deleteTypeField: (projectId: string, key: string, index: number) => void;

  addManualEdge: (from: string, to: string) => boolean;
}

export type DocStore = Doc & DocActions;

const EMPTY: Doc = { projects: [], areas: [], pages: [], edges: [], schemas: {} };

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
        set((s) => ({
          projects: [...s.projects, { id, name: 'New project', system: 'Untitled', accent: '#8fa5c9' }],
          areas: [...s.areas, { id: areaId, projectId: id, name: 'Notes', defaultType: 'note' }],
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
          return {
            projects: [...s.projects, project],
            areas: [...s.areas, ...(file.areas ?? [])],
            pages,
            edges: deriveWikiEdges(pages, [...s.edges, ...(file.links ?? []).filter((e) => e.kind !== 'wiki')]),
            schemas: { ...s.schemas, [project.id]: schema },
          };
        });
        return project;
      },

      /* ---------- areas ---------- */
      addArea: (projectId) => {
        const id = uid('a');
        const area: Area = { id, projectId, name: 'New area', defaultType: 'note' };
        set((s) => ({ areas: [...s.areas, area] }));
        return id;
      },

      renameArea: (id, name) =>
        set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, name } : a)) })),

      setAreaDefaultType: (id, defaultType) =>
        set((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, defaultType } : a)) })),

      /** Deleting an area deletes its pages and every edge that touched them. */
      deleteArea: (id) =>
        set((s) => {
          const doomed = new Set(s.pages.filter((p) => p.areaId === id).map((p) => p.id));
          return {
            areas: s.areas.filter((a) => a.id !== id),
            pages: s.pages.filter((p) => p.areaId !== id),
            edges: s.edges.filter((e) => !doomed.has(e.from) && !doomed.has(e.to)),
          };
        }),

      /* ---------- pages ---------- */
      addPage: ({ projectId, areaId, type, at, title }) => {
        const s = get();
        const area = s.areas.find((a) => a.id === areaId);
        const typeKey = type ?? area?.defaultType ?? 'note';
        const schema = s.schemas[projectId] ?? starterSchema();
        const blockType = schema.types[typeKey] ?? FALLBACK_TYPE;
        const id = uid('n');
        const page: Page = {
          id, projectId, areaId, type: typeKey,
          title: title ?? (typeKey === 'blank' ? 'Untitled page' : `Untitled ${blockType.label}`),
          x: at.x, y: at.y, w: CARD_W, h: CARD_H,
          fields: {}, custom: typeKey === 'blank' ? [] : null, cols: 0,
          body: '', updated: Date.now(),
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

      deletePage: (id) =>
        set((s) => ({
          pages: s.pages.filter((p) => p.id !== id),
          edges: s.edges.filter((e) => e.from !== id && e.to !== id),
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
              [key]: { label: 'New type', code: 'XX', color: '#8fa5c9', fields: [{ key: 'f1', label: 'Field', kind: 'text' }] },
            },
            typeOrder: [...schema.typeOrder.filter((k) => k !== 'blank'), key, 'blank'],
          })),
        );
      },

      renameType: (projectId, key, label) =>
        set((s) =>
          withSchema(s, projectId, (schema) => {
            const t = schema.types[key];
            if (!t) return schema;
            return { ...schema, types: { ...schema.types, [key]: { ...t, label } } };
          }),
        ),

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
      partialize: ({ projects, areas, pages, edges, schemas }) => ({ projects, areas, pages, edges, schemas }),
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

/** The fields a page renders, resolved against its project's schema. */
export function pageFields(doc: Doc, page: Page): Field[] {
  const schema = schemaFor(doc, page.projectId);
  return effectiveFields(page, blockType(schema, page.type).fields);
}

export { isCustomPage };

/* ---------- boot + autosave ---------- */

let hydrated = false;

/** Load the stored document (or seed on first run) and keep writing it back. */
export async function bootDoc(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const stored = await loadDoc<Partial<Doc>>();
  const doc: Doc = stored?.pages
    ? {
        projects: stored.projects ?? [],
        areas: stored.areas ?? [],
        pages: stored.pages,
        edges: stored.edges ?? [],
        schemas: stored.schemas ?? {},
      }
    : seed();

  // Every project must have a schema, and every schema must have 'blank'.
  const schemas: Record<string, ProjectSchema> = {};
  for (const p of doc.projects) schemas[p.id] = normaliseSchema(doc.schemas[p.id] ?? starterSchema());
  doc.schemas = schemas;

  useDoc.getState().hydrate(doc);
  useDoc.temporal.getState().clear();

  const write = debounce((d: Doc) => void saveDoc(d), 400);
  useDoc.subscribe(({ projects, areas, pages, edges, schemas: sc }) =>
    write({ projects, areas, pages, edges, schemas: sc }),
  );
}
