/**
 * Document persistence.
 *
 * `cartographer/v1` JSON is the on-disk format, so the browser build keeps the whole
 * document in IndexedDB rather than localStorage: it survives multi-megabyte projects
 * with embedded prose, and it is the same async shape a Tauri file backend will have.
 * localStorage stays for the small ephemeral UI slice only.
 */

const DB_NAME = 'cartographer';
const STORE = 'kv';
const ASSETS = 'assets';
const DOC_KEY = 'doc.v1';
/** Sync bookkeeping — which rows the server has seen, and when each changed here. */
export const SYNC_KEY = 'sync.v1';
const LS_FALLBACK = 'cartographer.v1';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Version 2 added the `assets` store. Image bytes are kept apart from the document
 * so that saving, undoing and syncing a page never move a picture around.
 */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read any local key, falling back to localStorage, then to null. */
export async function loadKey<T>(key: string): Promise<T | null> {
  try {
    const fromIdb = await idbGet<T>(key);
    if (fromIdb) return fromIdb;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(`cartographer.${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write any local key. Never throws — a failed save must not take the editor down. */
export async function saveKey(key: string, value: unknown): Promise<void> {
  try {
    await idbSet(key, value);
    return;
  } catch {
    /* fall through to localStorage */
  }
  try {
    localStorage.setItem(`cartographer.${key}`, JSON.stringify(value));
  } catch {
    /* storage full or blocked; the export button is the user's escape hatch */
  }
}

/** Read the stored document, falling back to the older localStorage key. */
export async function loadDoc<T>(): Promise<T | null> {
  const fromKey = await loadKey<T>(DOC_KEY);
  if (fromKey) return fromKey;
  try {
    const raw = localStorage.getItem(LS_FALLBACK);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write the document. Never throws — a failed save must not take the editor down. */
export async function saveDoc(value: unknown): Promise<void> {
  await saveKey(DOC_KEY, value);
}

/**
 * Ask the browser not to evict this origin's storage.
 *
 * Without it IndexedDB is "best effort" and can be cleared under storage pressure
 * with no warning — which is where the whole document lives, and where up to five
 * minutes of unsaved work sits waiting for the autosave. Chrome grants this
 * silently on engagement signals, Firefox may prompt, and Safari decides for
 * itself; a refusal is not an error, it just means the old guarantees apply.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    // Already granted: asking again would prompt a second time for no reason.
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Whether this origin's storage is exempt from eviction, as far as it will say. */
export async function storageIsPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** Trailing-edge debounce, so a drag writes once when it settles rather than per frame. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Leading-edge throttle: run now, then ignore further calls for `ms`. */
export function throttleLeading<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let until = 0;
  return (...args: A) => {
    const now = Date.now();
    if (now < until) return;
    until = now + ms;
    fn(...args);
  };
}
