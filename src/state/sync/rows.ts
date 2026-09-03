import type { Area, BlockType, Board, Doc, Edge, Field, Page, Project, ProjectSchema } from '../types';
import { normaliseSchema, starterSchema } from '../defaults';

/** The four synced tables. Edges only ever carry authored 'manual' rows. */
export const TABLES = ['projects', 'areas', 'boards', 'pages', 'edges'] as const;
export type Table = (typeof TABLES)[number];

export interface ProjectRow {
  id: string; name: string; system: string; accent: string;
  types: Record<string, BlockType>; type_order: string[]; updated: number;
}
export interface AreaRow {
  id: string; project_id: string; name: string; default_type: string; updated: number;
}
export interface BoardRow {
  id: string; project_id: string; area_id: string; name: string; updated: number;
}
export interface PageRow {
  id: string; project_id: string; board_id: string; type: string; title: string;
  x: number; y: number; w: number; h: number;
  fields: Record<string, string>; custom: Field[] | null; cols: number;
  body: string; updated: number;
}
export interface EdgeRow {
  id: string; project_id: string; from_page: string; to_page: string;
  kind: Edge['kind']; updated: number;
}

/* ---------- doc -> row ---------- */

export function projectRow(p: Project, schema: ProjectSchema | undefined, updated: number): ProjectRow {
  const s = schema ?? starterSchema();
  return {
    id: p.id, name: p.name, system: p.system, accent: p.accent,
    types: s.types, type_order: s.typeOrder, updated,
  };
}

export function areaRow(a: Area, updated: number): AreaRow {
  return { id: a.id, project_id: a.projectId, name: a.name, default_type: a.defaultType, updated };
}

export function boardRow(b: Board, updated: number): BoardRow {
  return { id: b.id, project_id: b.projectId, area_id: b.areaId, name: b.name, updated };
}

export function pageRow(p: Page, updated: number): PageRow {
  return {
    id: p.id, project_id: p.projectId, board_id: p.boardId, type: p.type, title: p.title,
    x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h),
    fields: p.fields, custom: p.custom, cols: p.cols, body: p.body, updated,
  };
}

/** Edges have no projectId of their own; it comes from the page the edge leaves. */
export function edgeRow(e: Edge, projectId: string, updated: number): EdgeRow {
  return { id: e.id, project_id: projectId, from_page: e.from, to_page: e.to, kind: e.kind, updated };
}

/* ---------- row -> doc ---------- */

export function toProject(r: ProjectRow): Project {
  return { id: r.id, name: r.name, system: r.system, accent: r.accent };
}

export function toSchema(r: ProjectRow): ProjectSchema {
  return normaliseSchema({ types: r.types ?? {}, typeOrder: r.type_order ?? [] });
}

export function toArea(r: AreaRow): Area {
  return { id: r.id, projectId: r.project_id, name: r.name, defaultType: r.default_type };
}

export function toBoard(r: BoardRow): Board {
  return { id: r.id, projectId: r.project_id, areaId: r.area_id, name: r.name };
}

export function toPage(r: PageRow): Page {
  const cols = Math.max(0, Math.min(4, r.cols ?? 0)) as Page['cols'];
  return {
    id: r.id, projectId: r.project_id, boardId: r.board_id, type: r.type, title: r.title,
    x: r.x, y: r.y, w: r.w, h: r.h,
    fields: r.fields ?? {}, custom: r.custom ?? null, cols,
    body: r.body ?? '', updated: r.updated,
  };
}

export function toEdge(r: EdgeRow): Edge {
  return { id: r.id, from: r.from_page, to: r.to_page, kind: r.kind };
}

/** Assemble a Doc from the four row sets. Derived edges are rebuilt by the caller. */
export function docFromRows(
  projects: ProjectRow[], areas: AreaRow[], boards: BoardRow[], pages: PageRow[], edges: EdgeRow[],
): Doc {
  const schemas: Record<string, ProjectSchema> = {};
  for (const r of projects) schemas[r.id] = toSchema(r);
  return {
    projects: projects.map(toProject),
    areas: areas.map(toArea),
    boards: boards.map(toBoard),
    pages: pages.map(toPage),
    edges: edges.map(toEdge),
    schemas,
  };
}
