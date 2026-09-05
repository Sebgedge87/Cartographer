/**
 * The spellchecker itself, off the main thread.
 *
 * Reading a Hunspell dictionary means parsing half a megabyte of word list and
 * expanding its affix rules — a second or so on a phone. Doing that on the main
 * thread would freeze the editor at the exact moment someone started typing in it,
 * so the whole checker lives here and the editor only ever sees the answers.
 *
 * The worker owns the fetching too: those bytes never touch the main thread.
 */
import nspell from 'nspell';
import type { NSpell } from 'nspell';
import { scanWords } from './words';
import type { WordSpan } from './words';

export type SpellRequest =
  | { id: number; type: 'load'; aff: string; dic: string }
  | { id: number; type: 'known'; words: string[] }
  | { id: number; type: 'check'; text: string }
  | { id: number; type: 'suggest'; word: string };

export type SpellResponse =
  | { id: number; type: 'ready' }
  | { id: number; type: 'spans'; spans: WordSpan[] }
  | { id: number; type: 'suggestions'; word: string; suggestions: string[] }
  | { id: number; type: 'failed'; message: string };

let speller: NSpell | null = null;
/** Resolves when the dictionary is in memory; every other request waits on it. */
let loaded: Promise<void> = Promise.resolve();
/**
 * Answers already given, cleared whenever the known-word list changes. Prose repeats
 * itself heavily, so this turns a re-check of a whole page into a handful of lookups.
 */
const verdicts = new Map<string, boolean>();
/**
 * Words this project taught the checker, so renaming a keep can un-teach its old
 * name. Only words the dictionary did not already know are ever in here: removing
 * "Ember" because a moon was renamed must not cost us the English word.
 */
let taught = new Set<string>();

async function load(aff: string, dic: string): Promise<void> {
  const [affText, dicText] = await Promise.all([
    fetch(aff).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${aff}`)))),
    fetch(dic).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${dic}`)))),
  ]);
  speller = nspell(affText, dicText);
}

/**
 * A word is known if the dictionary has it, or has the plain-apostrophe form of it,
 * or has the thing it is the possessive of — en_US lists `keep`, never `keep's`.
 */
function known(word: string): boolean {
  if (!speller) return true;
  const cached = verdicts.get(word);
  if (cached !== undefined) return cached;

  const straight = word.replace(/’/g, "'");
  const answer =
    speller.correct(word) ||
    (straight !== word && speller.correct(straight)) ||
    (/'s$/i.test(straight) && speller.correct(straight.slice(0, -2)));
  verdicts.set(word, answer);
  return answer;
}

/**
 * Bring the checker's extra words in line with the list, adding and dropping.
 *
 * `taught` must hold what we actually added, never what was merely wanted: once a
 * word has been added, `correct()` says yes to it, so testing wantedness against
 * the dictionary a second time would decide we had never taught it and take it
 * straight back out again.
 */
function teach(words: string[]): void {
  if (!speller) return;
  const wanted = new Set(words.filter(Boolean));
  const next = new Set<string>();
  for (const word of taught) {
    if (wanted.has(word)) next.add(word);
    else speller.remove(word);
  }
  for (const word of wanted) {
    if (next.has(word) || speller.correct(word)) continue;
    speller.add(word);
    next.add(word);
  }
  taught = next;
  verdicts.clear();
}

function check(text: string): WordSpan[] {
  if (!speller) return [];
  return scanWords(text).filter((span) => !known(span.word));
}

const post = (message: SpellResponse) => (self as unknown as Worker).postMessage(message);

self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      loaded = load(request.aff, request.dic);
      await loaded;
      post({ id: request.id, type: 'ready' });
      return;
    }
    await loaded;
    if (request.type === 'known') {
      teach(request.words);
      post({ id: request.id, type: 'ready' });
    } else if (request.type === 'check') {
      post({ id: request.id, type: 'spans', spans: check(request.text) });
    } else {
      post({
        id: request.id,
        type: 'suggestions',
        word: request.word,
        suggestions: speller ? speller.suggest(request.word).slice(0, 6) : [],
      });
    }
  } catch (error) {
    post({ id: request.id, type: 'failed', message: String(error) });
  }
};
