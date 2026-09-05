/**
 * Minimal typings for nspell, which ships none.
 *
 * Only what this app calls is declared. nspell is a Hunspell reader: it is handed
 * the two halves of a dictionary — the affix rules and the word list — and answers
 * questions about words.
 */
declare module 'nspell' {
  export interface NSpell {
    /** True when the word is in the dictionary, or derivable from it by an affix rule. */
    correct(word: string): boolean;
    /** Ordered best-first. Slow enough to be worth only doing on demand. */
    suggest(word: string): string[];
    /** Teach it a word. `model` copies another word's affix flags; we never need it. */
    add(word: string, model?: string): NSpell;
    /** Only ever called for a word `add` put there; see spell.worker.ts. */
    remove(word: string): NSpell;
  }
  export default function nspell(aff: string, dic: string): NSpell;
}
