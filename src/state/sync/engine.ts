import type { Doc } from '../types';
import { useDoc } from '../docStore';
import { useSync } from '../syncStore';
import { mergeDoc, type MergeMeta } from './merge';
import { supabase } from '../../lib/supabase';
import { syncAssets } from '../../lib/assets';
import { assetRefs } from '../../lib/markdown';
import { SYNC_KEY, debounce, loadKey, saveKey } from '../../lib/persist';
import { diffTable, rowKey } from './diff';
import {
  TABLES, type AreaRow, type BoardRow, type EdgeRow, type PageRow, type ProjectRow, type Table,
  areaRow, boardRow, docFromRows, edgeRow, pageRow, projectRow,
} from './rows';

/**
 * Sync model — deliberately the simplest thing that is correct for one person on
 * several machines:
 *
 *   * Supabase holds the document. The local store is what the UI reads and writes,
 *     so dragging a card and typing a body are never waiting on the network, and it
 *     doubles as the offline buffer: an edit is safe in IndexedDB the moment it is
 *     made, whether or not it has reached the server yet.
 *   * Changes are diffed per row and *held* until they are saved — either by the
 *     five-minute autosave, by the Save control, or when the tab is hidden. That
 *     keeps a save an event you can point at rather than a continuous trickle.
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
/** The last edit state seen per row, so a change is stamped once, when it happens. */
let seen: Record<Table, Map<string, string>> = blankBaseline();
let autosave: ReturnType<typeof setInterval> | null = null;
let onHide: (() => void) | null = null;

/** How long unsaved work is allowed to sit before it is saved for you. */
export const AUTOSAVE_MS = 5 * 60 * 1000;

function blankBaseline(): Record<Table, Map<string, string>> {
  return {
    projects: new Map(), areas: new Map(), boards: new Map(), pages: new Map(), edges: new Map(),
  };
}

/* ---------- building rows out of the current document ---------- */

function currentRows(doc: Doc) {
  const projectOf = new Map(doc.pages.map((p) => [p.id, p.projectId]));

  return {
    projects: doc.projects.map((p) => projectRow(p, doc.schemas[p.id], 0)),
    areas: doc.areas.map((a) => areaRow(a, 0)),
    boards: doc.boards.map((b) => boardRow(b, 0)),
    pages: doc.pages.map((p) => pageRow(p, 0)),
    edges: doc.edges
      .filter((e) => e.kind === 'manual')
      .map((e) => {
        const projectId = projectOf.get(e.from);
        return projectId ? edgeRow(e, projectId, 0) : null;
      })
      .filter((r): r is EdgeRow => r !== null),
  } satisfies Record<Table, { id: string }[]>;
}

/* ---------- push ---------- */

interface Scan {
  upserts: { table: Table; rows: unknown[] }[];
  deletes: { table: Table; ids: string[] }[];
  /** The baseline to adopt once these changes have landed on the server. */
  next: Record<Table, Map<string, string>>;
  /** How many rows are waiting to be saved. */
  count: number;
}

/**
 * Work out what the server is missing.
 *
 * Stamping happens here rather than at save time: with saves deferred, the moment
 * you *made* the edit is what last-write-wins should be comparing, not the moment
 * the autosave timer happened to fire. A row is stamped once per distinct edit
 * state, so a change sitting unsaved for five minutes keeps the time it was typed.
 */
function scan(): Scan {
  const rows = currentRows(useDoc.getState());
  const now = Date.now();
  const upserts: { table: Table; rows: unknown[] }[] = [];
  const deletes: { table: Table; ids: string[] }[] = [];
  const next = blankBaseline();
  let count = 0;

  for (const table of TABLES) {
    const d = diffTable(baseline[table], rows[table] as { id: string }[]);
    next[table] = d.next;
    if (d.changed.length) {
      const stamped = d.changed.map((row) => {
        const key = rowKey(row);
        if (seen[table].get(row.id) !== key) {
          seen[table].set(row.id, key);
          meta.touchedAt[table][row.id] = now;
        }
        return { ...row, updated: meta.touchedAt[table][row.id] ?? now };
      });
      upserts.push({ table, rows: stamped });
    }
    if (d.gone.length) deletes.push({ table, ids: d.gone });
    count += d.changed.length + d.gone.length;
  }
  return { upserts, deletes, next, count };
}

/** Count what is unsaved and tell the UI, without touching the network. */
function refreshPending(): void {
  if (!running) return;
  useSync.getState().set({ pending: scan().count });
}

const scheduleScan = debounce(refreshPending, 700);

async function push(): Promise<void> {
  if (!running || applying) return;
  const { upserts, deletes, next, count } = scan();
  if (!count) {
    useSync.getState().set({ pending: 0 });
    return;
  }
  const db = supabase();

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
    baseline = next;
    for (const table of TABLES) {
      meta.syncedIds[table] = [...baseline[table].keys()];
    }
    quietUntil = Date.now() + 1500;
    await saveKey(SYNC_KEY, meta);
    useSync.getState().set({
      status: 'synced', error: null, lastSyncedAt: Date.now(), pending: 0,
    });
  } catch (e) {
    // The baseline is deliberately left alone: nothing landed, so these rows are
    // still unsaved and the next attempt should send exactly the same set. They
    // keep the timestamps they were stamped with, not the retry's.
    useSync.getState().set({ status: 'error', error: describe(e), pending: count });
  }
}


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

  // Baseline is what the server actually has. Anything the merge kept beyond that
  // is a local change still waiting to be saved, and is counted as one.
  baseline = blankBaseline();
  for (const table of TABLES) {
    const rows = remoteRows[table] as { id: string }[];
    const current = currentRows(useDoc.getState())[table] as { id: string }[];
    const currentById = new Map(current.map((r) => [r.id, r]));
    for (const row of rows) {
      const match = currentById.get(row.id);
      if (match) baseline[table].set(row.id, rowKey(match));
    }
    // Rows that came back unchanged must not be re-stamped as fresh edits.
    seen[table] = new Map(current.map((r) => [r.id, rowKey(r)]));
    meta.syncedIds[table] = rows.map((r) => r.id);
  }
  await saveKey(SYNC_KEY, meta);
  useSync.getState().set({ status: 'synced', error: null, lastSyncedAt: Date.now() });
  refreshPending();
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
  seen = blankBaseline();

  try {
    await pull();
    // Reconciling what this device already had is not a user edit waiting on a
    // save button, so the first push after signing in goes up straight away.
    await push();
    // After the pull, because only then does this device know which images the
    // other one is waiting for. Never awaited: uploading a backlog of pictures
    // must not hold up the document arriving.
    void catchUpAssets();
  } catch (e) {
    useSync.getState().set({ status: 'error', error: describe(e) });
  }

  unsubscribeStore = useDoc.subscribe(() => {
    if (!applying) scheduleScan();
  });

  // Saving on a timer alone would lose the last few minutes of a session that ends
  // by closing the tab, so hiding it is also a save.
  onHide = () => {
    if (document.visibilityState === 'hidden' && useSync.getState().pending > 0) void push();
  };
  document.addEventListener('visibilitychange', onHide);

  autosave = setInterval(() => {
    if (useSync.getState().pending > 0) void push();
  }, AUTOSAVE_MS);

  channel = supabase()
    .channel('cartographer-doc')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      if (Date.now() < quietUntil) return;
      schedulePull();
    })
    .subscribe();
}

/** Send any image this device holds that the bucket has not got. */
async function catchUpAssets(): Promise<void> {
  const live = useDoc.getState().pages.flatMap((p) => [
    ...p.images.map((i) => i.id),
    ...assetRefs(p.body),
  ]);
  try {
    await syncAssets(live);
  } catch {
    /* best effort; the next pull tries again */
  }
}

export async function stopSync(): Promise<void> {
  running = false;
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (autosave) { clearInterval(autosave); autosave = null; }
  if (onHide) { document.removeEventListener('visibilitychange', onHide); onHide = null; }
  if (channel) {
    await supabase().removeChannel(channel);
    channel = null;
  }
  baseline = blankBaseline();
  seen = blankBaseline();
  meta = emptyMeta();
  useSync.getState().set({ pending: 0 });
  await saveKey(SYNC_KEY, meta);
}

/** Save unsaved work now — what the Save control and the autosave timer both call. */
export async function saveNow(): Promise<void> {
  if (!running) return;
  await push();
}

/** Force a full round trip — save, then take whatever the other devices have sent. */
export async function syncNow(): Promise<void> {
  if (!running) return;
  await push();
  await pull();
}
