/**
 * Image assets.
 *
 * Bytes never enter the document. Undo keeps whole-document snapshots, autosave
 * writes the document whole, and sync sends it row by row — a few megabytes of
 * picture in there would poison all three. So a page carries only a `PageImage`
 * ref and the blobs live in their own IndexedDB store, addressed by id.
 */

import type { PageImage } from '../state/types';
import { openDb } from './persist';
import { downloadAsset, remoteAssetIds, uploadAsset } from './remoteAssets';

export const ASSET_STORE = 'assets';

/**
 * Limits, all enforced on import rather than trusted. They are ceilings rather than
 * targets: an image is only ever scaled *down*, and only re-encoded until it fits,
 * so raising them costs a screenshot nothing and lets a map through.
 *
 * Maps are why they are as high as they are. A battle map or a region map is the
 * one picture in a setting you actually zoom into, and 1600px across was legible on
 * a card and useless for anything else.
 */
export const LIMITS = {
  /** Refused before we decode anything: a guard against a file that would blow the tab up. */
  maxInputBytes: 40 * 1024 * 1024,
  /** Longest edge of the stored full-size copy. 4096 is safe on every GPU we care about. */
  maxEdge: 4096,
  /** Longest edge of the copy used on cards and in the strip. */
  thumbEdge: 320,
  /** A stored image is re-encoded at falling quality until it fits, then refused. */
  maxStoredBytes: 8 * 1024 * 1024,
  /** Per page, so one page cannot grow without bound. */
  maxPerPage: 12,
};

const QUALITY_STEPS = [0.82, 0.7, 0.55, 0.4, 0.3];

interface AssetRecord {
  id: string;
  name: string;
  mime: string;
  w: number;
  h: number;
  bytes: number;
  full: Blob;
  thumb: Blob;
  created: number;
}

export type ImportResult =
  | { ok: true; image: PageImage }
  | { ok: false; reason: string };

/* ---------- store ---------- */

async function put(rec: AssetRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).put(rec, rec.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get(id: string): Promise<AssetRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const req = tx.objectStore(ASSET_STORE).get(id);
    req.onsuccess = () => resolve((req.result as AssetRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function drop(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- object URLs ---------- */

/**
 * Object URLs, cached so markdown can resolve one synchronously while rendering.
 * They are revoked when the asset is deleted; otherwise they live as long as the tab,
 * which is bounded by the number of images actually looked at.
 */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

/** The URL for an already-loaded asset, or null. Never fetches — safe inside render. */
export function assetUrl(id: string, variant: 'full' | 'thumb' = 'full'): string | null {
  return urls.get(`${variant}:${id}`) ?? null;
}

/** Load these assets into the URL cache. Resolves true if anything new arrived. */
export async function loadAssets(ids: string[], variant: 'full' | 'thumb' = 'full'): Promise<boolean> {
  let added = false;
  await Promise.all(
    ids.map(async (id) => {
      const key = `${variant}:${id}`;
      if (urls.has(key)) return;
      let job = pending.get(key);
      if (!job) {
        job = (async () => {
          try {
            const rec = (await get(id)) ?? (await pullAsset(id));
            if (rec) urls.set(key, URL.createObjectURL(variant === 'thumb' ? rec.thumb : rec.full));
          } catch {
            /* a missing asset renders as a placeholder rather than breaking the page */
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, job);
      }
      await job;
      if (urls.has(key)) added = true;
    }),
  );
  return added;
}

/**
 * Fetch an asset this device has never held and keep it. This is what a page
 * written on another machine does when its picture is first looked at: the ref
 * arrived with the document, the bytes arrive now, and only once.
 */
async function pullAsset(id: string): Promise<AssetRecord | null> {
  const remote = await downloadAsset(id);
  if (!remote) return null;
  const rec: AssetRecord = {
    id,
    // The name and dimensions live on the page's ref, which has already synced;
    // what the bucket holds is bytes. Nothing here is shown to anyone.
    name: id,
    mime: 'image/webp',
    w: 0,
    h: 0,
    bytes: remote.full.size,
    full: remote.full,
    thumb: remote.thumb,
    created: Date.now(),
  };
  try {
    await put(rec);
  } catch {
    /* keeping it was the optimisation; the URL below still works this session */
  }
  return rec;
}

/**
 * Upload every asset this device holds that the bucket is missing.
 *
 * Covers the cases a single upload-on-import cannot: images added before sync was
 * configured, an upload that failed while offline, and a device that had a project
 * before it had an account. Called after a pull, when the document is current
 * enough to say which assets are still referenced.
 */
export async function syncAssets(live: Iterable<string>): Promise<number> {
  const remote = await remoteAssetIds();
  if (!remote) return 0;
  let sent = 0;
  for (const id of new Set(live)) {
    if (remote.has(id)) continue;
    const rec = await get(id).catch(() => null);
    if (!rec) continue;
    if (await uploadAsset(id, rec.full, rec.thumb)) sent++;
  }
  return sent;
}

/**
 * Local only. The bucket is deliberately left alone: this is called by the boot
 * sweep, whose idea of what is still referenced comes from the last document this
 * device happened to have, and deleting another machine's picture on the strength
 * of that is not a trade worth making. Orphaned objects are small and rare.
 */
export async function deleteAsset(id: string): Promise<void> {
  for (const variant of ['full', 'thumb'] as const) {
    const key = `${variant}:${id}`;
    const url = urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
  try {
    await drop(id);
  } catch {
    /* the ref is already gone from the document; an orphaned blob is not worth failing over */
  }
}

/* ---------- import ---------- */

function scaled(w: number, h: number, edge: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= edge) return { w, h };
  const k = edge / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function draw(bitmap: ImageBitmap, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/** Encode at falling quality until it fits the cap. Null means it never did. */
async function encodeUnder(canvas: HTMLCanvasElement, cap: number): Promise<Blob | null> {
  let last: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    const blob = await encode(canvas, q);
    if (!blob) return null;
    last = blob;
    if (blob.size <= cap) return blob;
  }
  return last && last.size <= cap ? last : null;
}

function prettyBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/**
 * Take a file, shrink and re-encode it, store the bytes, and hand back the ref the
 * document keeps. Re-encoding is also what makes an SVG safe: it is rasterised, so
 * nothing scriptable survives into the store.
 */
export async function importImage(file: File): Promise<ImportResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, reason: `${file.name || 'That file'} is not an image` };
  }
  if (file.size > LIMITS.maxInputBytes) {
    return {
      ok: false,
      reason: `Too big — ${prettyBytes(file.size)}, limit is ${prettyBytes(LIMITS.maxInputBytes)}`,
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: 'That image could not be read' };
  }

  try {
    const size = scaled(bitmap.width, bitmap.height, LIMITS.maxEdge);
    const full = await encodeUnder(draw(bitmap, size.w, size.h), LIMITS.maxStoredBytes);
    if (!full) {
      return { ok: false, reason: 'That image would not compress small enough to store' };
    }
    const t = scaled(bitmap.width, bitmap.height, LIMITS.thumbEdge);
    const thumb = (await encode(draw(bitmap, t.w, t.h), 0.7)) ?? full;

    const id = `img_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    const name = (file.name || 'image').replace(/\.[a-z0-9]+$/i, '').slice(0, 60);
    await put({
      id, name, mime: 'image/webp',
      w: size.w, h: size.h, bytes: full.size,
      full, thumb, created: Date.now(),
    });
    // Sent, not awaited: the picture is already on this device and in the page, and
    // an upload that fails is caught by syncAssets on the next pull.
    void uploadAsset(id, full, thumb);
    return { ok: true, image: { id, name, w: size.w, h: size.h, bytes: full.size } };
  } catch {
    return { ok: false, reason: 'That image could not be processed' };
  } finally {
    bitmap.close();
  }
}

/** How the body refers to a stored image. Kept out of markdown.ts so both agree. */
export const ASSET_SCHEME = 'asset:';

export function assetIdFromSrc(src: string): string | null {
  return src.startsWith(ASSET_SCHEME) ? src.slice(ASSET_SCHEME.length) : null;
}

/**
 * Delete every stored blob no page refers to any more.
 *
 * This runs at boot rather than when an image is removed, and deliberately so:
 * removing an image is undoable, and reaping the bytes on the spot would make undo
 * restore a ref pointing at nothing. At boot there is no history to undo into, so
 * an unreferenced blob is genuinely dead. Orphans survive one session at most.
 */
export async function sweepAssets(live: Iterable<string>): Promise<number> {
  const keep = new Set(live);
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return 0;
  }
  const ids = await new Promise<string[]>((resolve) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const req = tx.objectStore(ASSET_STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => resolve([]);
  });
  const dead = ids.filter((id) => !keep.has(id));
  await Promise.all(dead.map((id) => deleteAsset(id)));
  return dead.length;
}
