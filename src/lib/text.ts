/**
 * Textarea primitives. Every one of these restores focus and places the caret
 * afterwards — losing the caret mid-edit is the fastest way to make the editor
 * feel broken.
 */

export interface TextEdit {
  value: string;
  /** Caret position, or a selection range. */
  start: number;
  end: number;
}

/** Wrap the selection (or insert a placeholder) in `pre`/`post`. */
export function wrapSelection(el: HTMLTextAreaElement, pre: string, post: string, placeholder = ''): TextEdit {
  const a = el.selectionStart;
  const b = el.selectionEnd;
  const v = el.value;
  const mid = a === b ? placeholder : v.slice(a, b);
  return {
    value: v.slice(0, a) + pre + mid + post + v.slice(b),
    start: a + pre.length,
    end: a + pre.length + mid.length,
  };
}

/** Put `prefix` at the start of the caret's line. */
export function prefixLine(el: HTMLTextAreaElement, prefix: string): TextEdit {
  const v = el.value;
  const a = el.selectionStart;
  const lineStart = v.lastIndexOf('\n', a - 1) + 1;
  return {
    value: v.slice(0, lineStart) + prefix + v.slice(lineStart),
    start: a + prefix.length,
    end: a + prefix.length,
  };
}

/** Insert a block at the caret, opening a new line first if we are mid-line. */
export function insertBlock(el: HTMLTextAreaElement, text: string, caretOffset?: number): TextEdit {
  const a = el.selectionStart;
  const v = el.value;
  const pad = a === 0 || v[a - 1] === '\n' ? '' : '\n';
  const pos = a + pad.length + (caretOffset ?? text.length);
  return { value: v.slice(0, a) + pad + text + v.slice(a), start: pos, end: pos };
}

/** Replace the `len` characters before the caret — how a popover accepts a choice. */
export function replaceAtCaret(el: HTMLTextAreaElement, len: number, text: string, caretOffset?: number): TextEdit {
  const c = el.selectionStart;
  const v = el.value;
  const pos = c - len + (caretOffset ?? text.length);
  return { value: v.slice(0, c - len) + text + v.slice(c), start: pos, end: pos };
}

/** Apply an edit's caret position once React has flushed the new value. */
export function restoreCaret(el: HTMLTextAreaElement | null, edit: TextEdit): void {
  if (!el) return;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(edit.start, edit.end);
  });
}

export type CaretTrigger =
  | { kind: 'wiki'; q: string; len: number }
  | { kind: 'slash'; q: string; len: number }
  | null;

/**
 * What, if anything, the caret is currently completing.
 * `/word` only counts at the start of a line; `[[` counts anywhere.
 */
export function caretTrigger(el: HTMLTextAreaElement | null): CaretTrigger {
  if (!el) return null;
  const before = el.value.slice(0, el.selectionStart);
  const wiki = /\[\[([^\]\n]*)$/.exec(before);
  if (wiki) return { kind: 'wiki', q: wiki[1] ?? '', len: wiki[0].length };
  const slash = /(?:^|\n)\/([\w-]*)$/.exec(before);
  if (slash) return { kind: 'slash', q: slash[1] ?? '', len: (slash[1] ?? '').length + 1 };
  return null;
}

/** Make `base` unique against `taken`, appending 2, 3, … */
export function uniqueTitle(base: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (t) => t.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}
