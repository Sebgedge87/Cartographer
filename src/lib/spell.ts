/**
 * The editor's side of the spellchecker: one worker, started the first time anyone
 * asks it anything, and never started at all if nobody does.
 *
 * A browser will not let a page extend its own spellchecker — `spellcheck` is a
 * boolean with no companion word list, and the dictionary behind it belongs to the
 * browser profile, not the site. So the app runs its own, which is also the only
 * way a dictionary of invented names can travel with the project instead of being
 * stranded on whichever machine first typed them.
 */
import type { SpellRequest, SpellResponse } from './spell.worker';
import type { WordSpan } from './words';

export type SpellStatus = 'off' | 'loading' | 'ready' | 'failed';

const ENABLED_KEY = 'cartographer.spellcheck';

/** On unless it has been turned off. Nobody enables a spellchecker on purpose. */
export function storedSpelling(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function rememberSpelling(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode; the choice just will not survive a reload */
  }
}

let worker: Worker | null = null;
let status: SpellStatus = 'off';
let nextId = 1;
/** Request id → the resolver waiting on it. Rejected wholesale if the worker dies. */
const pending = new Map<number, (response: SpellResponse) => void>();
const watchers = new Set<(status: SpellStatus) => void>();

/** Every request shape without its id, which `send` assigns. Distributes over the
 *  union — a plain Omit would collapse the four shapes into their shared nothing. */
type Unsent<T> = T extends { id: number } ? Omit<T, 'id'> : never;

function setStatus(next: SpellStatus): void {
  if (status === next) return;
  status = next;
  for (const watcher of watchers) watcher(next);
}

export function spellStatus(): SpellStatus {
  return status;
}

/** Subscribe to load/failure, so a status strip can say what is happening. */
export function watchSpellStatus(fn: (status: SpellStatus) => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}

/**
 * The dictionary is fetched, not bundled: half a megabyte has no business in the
 * main chunk, and the browser caches it like any other file. Resolved against the
 * page rather than left relative — the worker's own base is not the app's.
 */
function dictionaryUrls(): { aff: string; dic: string } {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return {
    aff: new URL('dict/index.aff', base).href,
    dic: new URL('dict/index.dic', base).href,
  };
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    setStatus('failed');
    return null;
  }
  worker.onmessage = (event: MessageEvent<SpellResponse>) => {
    const resolve = pending.get(event.data.id);
    pending.delete(event.data.id);
    if (event.data.type === 'failed') setStatus('failed');
    resolve?.(event.data);
  };
  worker.onerror = () => {
    setStatus('failed');
    for (const [, resolve] of pending) resolve({ id: 0, type: 'failed', message: 'worker error' });
    pending.clear();
  };
  setStatus('loading');
  const { aff, dic } = dictionaryUrls();
  void send({ type: 'load', aff, dic }).then((r) => {
    if (r.type === 'ready') setStatus('ready');
  });
  return worker;
}

function send(request: Unsent<SpellRequest>): Promise<SpellResponse> {
  const w = ensureWorker();
  const id = nextId++;
  if (!w) return Promise.resolve({ id, type: 'failed', message: 'no worker' });
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ ...request, id } as SpellRequest);
  });
}

/** Words the checker should accept on top of English: the project's own vocabulary. */
export function teachWords(words: string[]): void {
  void send({ type: 'known', words });
}

/** Misspelt words in `text`, with the positions to underline. Empty until ready. */
export async function checkText(text: string): Promise<WordSpan[]> {
  const response = await send({ type: 'check', text });
  return response.type === 'spans' ? response.spans : [];
}

export async function suggestFor(word: string): Promise<string[]> {
  const response = await send({ type: 'suggest', word });
  return response.type === 'suggestions' ? response.suggestions : [];
}

/** Shut it down and forget the dictionary — spellcheck turned off should cost nothing. */
export function stopSpelling(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
  setStatus('off');
}
