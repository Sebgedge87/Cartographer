/**
 * Spellchecking one body of text, at the pace a person types rather than the pace a
 * key repeats: every keystroke would ask the worker a question whose answer is
 * obsolete before it arrives.
 */
import { useEffect, useRef, useState } from 'react';
import { checkText, spellStatus, teachWords, watchSpellStatus } from './spell';
import type { SpellStatus } from './spell';
import type { WordSpan } from './words';

/** Long enough to skip the middle of a word, short enough to feel immediate. */
const SETTLE_MS = 400;

export interface Spelling {
  /** Misspelt words, or empty while off, loading, or unavailable. */
  spans: WordSpan[];
  status: SpellStatus;
}

export function useSpellcheck(text: string, enabled: boolean, known: string[]): Spelling {
  const [spans, setSpans] = useState<WordSpan[]>([]);
  const [status, setStatus] = useState<SpellStatus>(spellStatus);
  // The list is rebuilt on every document change, but its contents rarely differ;
  // comparing the joined text is far cheaper than re-teaching the worker.
  const taught = useRef<string | null>(null);

  useEffect(() => watchSpellStatus(setStatus), []);

  useEffect(() => {
    if (!enabled) {
      taught.current = null;
      return;
    }
    const signature = known.join('\n');
    if (taught.current === signature) return;
    taught.current = signature;
    teachWords(known);
    // A new word means the old verdicts are stale, so ask again straight away.
    let live = true;
    void checkText(text).then((next) => live && setSpans(next));
    return () => { live = false; };
    // `text` is deliberately not a dependency: this effect is about the word list.
  }, [enabled, known]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      setSpans([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void checkText(text).then((next) => live && setSpans(next));
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, enabled]);

  return { spans, status };
}
