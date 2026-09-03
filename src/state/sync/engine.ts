import type { Doc } from '../types';
import { useDoc } from '../docStore';
import { useSync } from '../syncStore';
import { mergeDoc, type MergeMeta } from './merge';
import { supabase } from '../../lib/supabase';
import { SYNC_KEY, debounce, loadKey, saveKey } from '../../lib/persist';
import {
  TABLES, type AreaRow, type BoardRow, type EdgeRow, type PageRow, type ProjectRow, type Table,
  areaRow, boardRow, docFromRows, edgeRow, pageRow, projectRow,
} from './rows';

/**
 * Sync model — deliberately the simplest thing that is correct for one person on
 * several machines:
 *
 *   * The local store stays the thing the UI reads and writes, so dragging a card
 *     and typing a body are never waiting on the network.
 *   * Changes are diffed per row and pushed on a debounce, so a drag writes one
 *     page row when it settles rather than one per frame.
 *   * Conflicts resolve last-write-wins per row. Two machines editing *different*
 *     pages both survive; the same page at the same moment does not, and that is an
 *     accepted trade for this use case.
 *   * Only 'manual' edges are stored. Wiki and field edges are re-derived after
 *     every pull.
 */

type SyncMeta = MergeMeta;

const emptyMeta = (): SyncMeta => ({
  syncedIds: { projects: [], areas: [], boards: [], pages: [], edges: [] },
  touchedAt: { projects: {}, areas: {}, boards: {}, pages: {}, edges: {} },
});

let meta: SyncMeta = emptyMeta();
let baseline: Record<Table, Map<string, string>> = blankBaseline();
let unsubscribeStore: (() => void) | null = null;
let channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
let running = false;
/** Set while remote data is being written into the store, so it is not pushed back. */
let applying = false;
/** Ignore realtime echoes of our own writes for a moment after pushing. */
let quietUntil = 0;

function blankBaseline(): Record<Table, Map<string, string>> {
  return {
    projects: new Map(), areas: new Map(), boards: new Map(), pages: new Map(), edges: new Map(),
  };
}

/* ---------- building rows out of the current document ---------- */

function currentRows(doc: Doc) {
  const now = Date.now();
  const stamp = (table: Table, id: string) => meta.touchedAt[table][id] ?? now;

  const projectOf = new Map(doc.pages.map((p) => [p.id, p.projectId]));

  return {
    projects: doc.projects.map((p) => projectRow(p, doc.schemas[p.id], stamp('projects', p.id))),
    areas: doc.areas.map((a) => areaRow(a, stamp('areas', a.id))),
    boards: doc.boards.map((b) => boardRow(b, stamp('boards', b.id))),
    pages: doc.pages.map((p) => pageRow(p, stamp('pages', p.id))),
    edges: doc.edges
      .filter((e) => e.kind === 'manual')
      .map((e) => {
        const projectId = projectOf.get(e.from);
        return projectId ? edgeRow(e, projectId, stamp('edges', e.id)) : null;
      })
      .filter((r): r is EdgeRow => r !== null),
  } satisfies Record<Table, { id: string }[]>;
}

/* ---------- push ---------- */

async function push(): Promise<void> {
  if (!running || applying) return;
  const doc = useDoc.getState();
  const rows = currentRows(doc);
  const db = supabase();

  const upserts: { table: Table; rows: unknown[] }[] = [];
  const deletes: { table: Table; ids: string[] }[] = [];
  const now = Date.now();

  for (const table of TABLES) {
    const next = new Map<string, string>();
    const changed: unknown[] = [];
    for (const row of rows[table] as { id: string }[]) {
      const json = JSON.stringify(row);
      next.set(row.id, json);
      if (baseline[table].get(row.id) !== json) {
        // Stamp the change now so last-write-wins has something local to compare.
        meta.touchedAt[table][row.id] = now;
        changed.push({ ...row, updated: now });
      }
    }
    const gone = [...baseline[table].keys()].filter((id) => !next.has(id));
    if (changed.length) upserts.push({ table, rows: changed });
    if (gone.length) deletes.push({ table, ids: gone });
    baseline[table] = next;
  }

  if (!upserts.length && !deletes.length) return;

  useSync.getState().set({ status: 'syncing' });
  try {
    // Parents before children on insert, children before parents on delete, so
    // foreign keys are satisfied in both directions.
    for (const { table, rows: batch } of upserts) {
      const { error } = await db.from(table).upsert(batch, { onConflict: 'id' });
      if (error) throw error;
    }
    for (const { table, ids } of [...deletes].reverse()) {
      const { error } = await db.from(table).delete().in('id', ids);
      if (error) throw error;
    }
    for (const table of TABLES) {
      meta.syncedIds[table] = [...baseline[table].keys()];
    }
    quietUntil = Date.now() + 1500;
    await saveKey(SYNC_KEY, meta);
    useSync.getState().set({ status: 'synced', error: null, lastSyncedAt: Date.now() });
  } catch (e) {
    // Drop the baseline so the next tick retries everything rather than assuming
    // the failed rows landed.
    baseline = blankBaseline();
    useSync.getState().set({ status: 'error', error: describe(e) });
  }
}

const schedulePush = debounce(() => void push(), 600);

/* ---------- pull + merge ---------- */

async function pull(): Promise<void> {
  if (!running) return;
  const db = supabase();
  useSync.getState().set({ status: 'syncing' });

  const [projects, areas, boards, pages, edges] = await Promise.all([
    db.from('projects').select('*'),
    db.from('areas').select('*'),
    db.from('boards').select('*'),
    db.from('pages').select('*'),
    db.from('edges').select('*'),
  ]);
  const failed = [projects, areas, boards, pages, edges].find((r) => r.error);
  if (failed?.error) throw failed.error;

  const remoteRows: Record<Table, { id: string; updated: number }[]> = {
    projects: (projects.data ?? []) as ProjectRow[],
    areas: (areas.data ?? []) as AreaRow[],
    boards: (boards.data ?? []) as BoardRow[],
    pages: (pages.data ?? []) as PageRow[],
    edges: (edges.data ?? []) as EdgeRow[],
  };
  const remote = docFromRows(
    remoteRows.projects as ProjectRow[],
    remoteRows.areas as AreaRow[],
    remoteRows.boards as BoardRow[],
    remoteRows.pages as PageRow[],
    remoteRows.edges as EdgeRow[],
  );
  const stamps = (rows: { id: string; updated: number }[]) =>
    new Map(rows.map((r) => [r.id, r.updated ?? 0]));

  const merged: Doc = mergeDoc(useDoc.getState(), remote, {
    projects: stamps(remoteRows.projects),
    areas: stamps(remoteRows.areas),
    boards: stamps(remoteRows.boards),
    pages: stamps(remoteRows.pages),
    edges: stamps(remoteRows.edges),
  }, meta);

  applying = true;
  try {
    useDoc.getState().applyRemote(merged);
  } finally {
    applying = false;
  }

  // Baseline is what the server actually has; anything merged in beyond that gets
  // pushed on the next tick.
  baseline = blankBaseline();
  for (const table of TABLES) {
    const rows = remoteRows[table] as { id: string }[];
    const currentByTable = currentRows(useDoc.getState())[table] as { id: string }[];
    const currentById = new Map(currentByTable.map((r) => [r.id, r]));
    for (const row of rows) {
      const current = currentById.get(row.id);
      if (current) baseline[table].set(row.id, JSON.stringify(current));
    }
    meta.syncedIds[table] = rows.map((r) => r.id);
  }
  await saveKey(SYNC_KEY, meta);
  useSync.getState().set({ status: 'synced', error: null, lastSyncedAt: Date.now() });
  schedulePush();
}

const schedulePull = debounce(() => {
  pull().catch((e) => useSync.getState().set({ status: 'error', error: describe(e) }));
}, 800);

/* ---------- lifecycle ---------- */

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function startSync(): Promise<void> {
  if (running) return;
  running = true;
  useSync.getState().set({ status: 'connecting', error: null });

  meta = (await loadKey<SyncMeta>(SYNC_KEY)) ?? emptyMeta();
  for (const table of TABLES) {
    meta.syncedIds[table] ??= [];
    meta.touchedAt[table] ??= {};
  }
  baseline = blankBaseline();

  try {
    await pull();
  } catch (e) {
    useSync.getState().set({ status: 'error', error: describe(e) });
  }

  unsubscribeStore = useDoc.subscribe(() => {
    if (!applying) schedulePush();
  });

  channel = supabase()
    .channel('cartographer-doc')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      if (Date.now() < quietUntil) return;
      schedulePull();
    })
    .subscribe();
}

export async function stopSync(): Promise<void> {
  running = false;
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (channel) {
    await supabase().removeChannel(channel);
    channel = null;
  }
  baseline = blankBaseline();
  meta = emptyMeta();
  await saveKey(SYNC_KEY, meta);
}

/** Force a round trip — used by the "Sync now" control. */
export async function syncNow(): Promise<void> {
  if (!running) return;
  await push();
  await pull();
}
