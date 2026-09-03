import type { Area, Board, Doc, Edge, Page, Project, ProjectSchema } from '../types';
import { deriveAllEdges } from '../graph';
import type { Table } from './rows';

export interface MergeMeta {
  /** Row ids the server is known to have had. */
  syncedIds: Record<Table, string[]>;
  /** When each row last changed on this machine. */
  touchedAt: Record<Table, Record<string, number>>;
}

export type Stamps = Map<string, number>;

/**
 * Merge one table under last-write-wins.
 *
 * Remote wins unless this machine touched the row more recently. A row present
 * here but missing remotely was deleted elsewhere — but only if we know the server
 * once had it; otherwise it simply has not been pushed yet and must survive.
 */
export function mergeTable<T extends { id: string }>(
  table: Table,
  local: T[],
  remote: T[],
  remoteStamps: Stamps,
  meta: MergeMeta,
): T[] {
  const synced = new Set(meta.syncedIds[table] ?? []);
  const touched = meta.touchedAt[table] ?? {};
  const localById = new Map(local.map((r) => [r.id, r]));
  const out: T[] = [];

  for (const row of remote) {
    const mine = localById.get(row.id);
    const mineAt = touched[row.id] ?? 0;
    out.push(mine && mineAt > (remoteStamps.get(row.id) ?? 0) ? mine : row);
    localById.delete(row.id);
  }
  for (const [id, row] of localById) {
    if (!synced.has(id)) out.push(row);
  }
  return out;
}

export interface RemoteStamps {
  projects: Stamps;
  areas: Stamps;
  boards: Stamps;
  pages: Stamps;
  edges: Stamps;
}

/**
 * Merge a whole pulled document into the local one, then rebuild derived edges.
 * Orphans are dropped rather than allowed to resurrect a half-deleted project.
 */
export function mergeDoc(local: Doc, remote: Doc, stamps: RemoteStamps, meta: MergeMeta): Doc {
  const projects = mergeTable<Project>('projects', local.projects, remote.projects, stamps.projects, meta);
  const areas = mergeTable<Area>('areas', local.areas, remote.areas, stamps.areas, meta);
  const boards = mergeTable<Board>('boards', local.boards, remote.boards, stamps.boards, meta);
  const pages = mergeTable<Page>('pages', local.pages, remote.pages, stamps.pages, meta);
  const manual = mergeTable<Edge>(
    'edges',
    local.edges.filter((e) => e.kind === 'manual'),
    remote.edges.filter((e) => e.kind === 'manual'),
    stamps.edges,
    meta,
  );

  const projectIds = new Set(projects.map((p) => p.id));
  // A project's schema rides on its row, so prefer the remote copy when there is one.
  const schemas: Record<string, ProjectSchema> = {};
  for (const p of projects) {
    const schema = remote.schemas[p.id] ?? local.schemas[p.id];
    if (schema) schemas[p.id] = schema;
  }

  const keptAreas = areas.filter((a) => projectIds.has(a.projectId));
  const areaIds = new Set(keptAreas.map((a) => a.id));
  // A board outside an area, or a page off a board, cannot be reached — drop rather
  // than orphan, at each level of the hierarchy in turn.
  const keptBoards = boards.filter((b) => projectIds.has(b.projectId) && areaIds.has(b.areaId));
  const boardIds = new Set(keptBoards.map((b) => b.id));
  const keptPages = pages.filter((p) => projectIds.has(p.projectId) && boardIds.has(p.boardId));
  const pageIds = new Set(keptPages.map((p) => p.id));
  const keptManual = manual.filter((e) => pageIds.has(e.from) && pageIds.has(e.to));

  return {
    projects,
    areas: keptAreas,
    boards: keptBoards,
    pages: keptPages,
    schemas,
    edges: deriveAllEdges(
      keptPages,
      (page) => page.custom ?? schemas[page.projectId]?.types[page.type]?.fields ?? [],
      keptManual,
    ),
  };
}
