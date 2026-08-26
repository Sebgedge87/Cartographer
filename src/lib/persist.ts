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
const KEY = 'doc.v1';
const LS_FALLBACK = 'cartographer.v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no indexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T>(): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read the stored document, falling back to localStorage, then to null. */
export async function loadDoc<T>(): Promise<T | null> {
  try {
    const fromIdb = await idbGet<T>();
    if (fromIdb) return fromIdb;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write the document. Never throws — a failed save must not take the editor down. */
export async function saveDoc(value: unknown): Promise<void> {
  try {
    await idbSet(value);
    return;
  } catch {
    /* fall through to localStorage */
  }
  try {
    localStorage.setItem(LS_FALLBACK, JSON.stringify(value));
  } catch {
    /* storage full or blocked; the export button is the user's escape hatch */
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
