/**
 * Finding the words in a markdown body, which is not the same as splitting on
 * spaces: a spellchecker that flags `gm` out of `> [!gm]`, `asset` out of an image
 * ref, or `nd` out of `2nd` is worse than no spellchecker at all, because every
 * real mistake is then buried in noise the reader learns to scroll past.
 *
 * Pure and free of the DOM, so the worker and the tests can both use it.
 */

export interface WordSpan {
  word: string;
  /** Index into the source text, so a caller can underline or replace it. */
  start: number;
  end: number;
}

/**
 * Everything checked for spelling has to survive this list first. The order is the
 * order of alternation, so the longer construct has to come before the shorter one
 * it starts with — `![[Page]]` before `[[Page]]`, ``` before `.
 *
 * The wikilink, stat-reference and dice patterns are deliberately the same grammar
 * markdown.ts renders, so what is skipped here is exactly what stops being prose
 * in the preview.
 */
const SKIP = new RegExp(
  [
    /```[\s\S]*?(?:```|$)/,                    // fenced code, terminated or not
    /~~~[\s\S]*?(?:~~~|$)/,                    // the other fence
    /`[^`\n]*`/,                               // inline code
    /!?\[\[[^\]\n]*\]\]/,                      // [[Page]] and ![[Page]]
    /@@[A-Za-z0-9'’\- ]+/,                     // @@Page — inline stat line
    /@[A-Za-z0-9'’\- ]+?\.[a-z_]+/,            // @Page.field
    /\b\d{0,3}d\d{1,3}(?:[+-]\d{1,3})?\b/,     // 2d6+3, and a bare d20
    /\[![A-Za-z]+\]/,                          // [!gm], [!note] — callout markers
    /\]\([^)\n]*\)/,                           // a link or image target, not its text
    /\basset:[A-Za-z0-9_]+/,                   // asset:ab12cd — an attached image
    /\b[a-z][a-z0-9+.-]*:\/\/\S+/i,            // bare URL
    /<[^>\s]*>/,                               // autolink, and any stray tag
    /&[A-Za-z]+;|&#\d+;/,                      // HTML entity
  ].map((r) => r.source).join('|'),
  'g',
);

/** Letters, with apostrophes allowed inside a word — "don't", "Cassiel's". */
const WORD = /[A-Za-z][A-Za-z'’]*/g;

/** Ranges of `text` that are not prose, as [start, end) pairs, in order. */
function skipped(text: string): [number, number][] {
  const out: [number, number][] = [];
  SKIP.lastIndex = 0;
  for (let m = SKIP.exec(text); m; m = SKIP.exec(text)) {
    out.push([m.index, m.index + m[0].length]);
    // A zero-length match would spin forever; nothing here can produce one, but
    // the guard costs nothing and a future pattern might.
    if (m[0].length === 0) SKIP.lastIndex++;
  }
  return out;
}

/**
 * The words in `text`, in order, with the positions they were found at.
 *
 * Skipped, because none of it is English and all of it would be flagged: anything
 * inside a construct above, a token touching a digit (`2nd`, `d6`, `x3`), a single
 * letter, and anything written in capitals — `HP`, `AC`, `GM` are abbreviations a
 * dictionary has no opinion about, and the cost of missing `TEH` is far smaller
 * than the cost of underlining every stat name in the project.
 */
export function scanWords(text: string): WordSpan[] {
  const skips = skipped(text);
  let next = 0;
  const out: WordSpan[] = [];
  WORD.lastIndex = 0;

  for (let m = WORD.exec(text); m; m = WORD.exec(text)) {
    const start = m.index;
    // The skip list is in order and so are the matches, so this walks forward once
    // over both rather than searching the list per word.
    while (next < skips.length && skips[next]![1] <= start) next++;
    const skip = skips[next];
    if (skip && start < skip[1] && skip[0] < start + m[0].length) continue;

    // Trim trailing apostrophes: "the '90s" and a quoted 'word' both leave one.
    const word = m[0].replace(/['’]+$/, '');
    if (word.length < 2) continue;
    const end = start + word.length;
    if (/[0-9]/.test(text[start - 1] ?? '') || /[0-9]/.test(text[end] ?? '')) continue;
    if (word === word.toUpperCase()) continue;

    out.push({ word, start, end });
  }
  return out;
}

/**
 * Words worth putting in a dictionary, taken from a name the user wrote. Used to
 * seed a project's dictionary from its own page titles and labels: those are
 * invented words by definition, and asking someone to add "Cassiel" by hand when
 * they have already typed it as a page title is asking twice.
 */
export function wordsIn(name: string): string[] {
  return scanWords(name).map((w) => w.word);
}
