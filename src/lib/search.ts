import type { Field, Page } from '../state/types';

/**
 * Finding a page by what is written on it.
 *
 * The rail used to filter on `page.title` alone, which meant the prose bodies and
 * every field value — most of what a project actually contains — could not be found
 * at all. "Where did I mention the Ashen Gate" is the question this answers.
 */

/** How many characters of context to show either side of a hit. */
const CONTEXT = 32;

export interface Excerpt {
  before: string;
  /** The matched text, exactly as it is written on the page. */
  hit: string;
  after: string;
}

export interface PageMatch {
  /** Title matches rank first, then fields, then the body. */
  where: 'title' | 'field' | 'body';
  /** The field's label, when the match was in a field value. */
  label: string | null;
  excerpt: Excerpt;
}

/**
 * Newlines and tabs become spaces so an excerpt stays on one line. The replacement
 * is one character for one, which keeps every offset below valid.
 */
const flatten = (text: string) => text.replace(/[\r\n\t]/g, ' ');

function excerptAt(text: string, at: number, length: number): Excerpt {
  const flat = flatten(text);
  const start = Math.max(0, at - CONTEXT);
  const end = Math.min(flat.length, at + length + CONTEXT);
  return {
    before: (start > 0 ? '…' : '') + flat.slice(start, at),
    hit: flat.slice(at, at + length),
    after: flat.slice(at + length, end) + (end < flat.length ? '…' : ''),
  };
}

/**
 * Where `query` appears on `page`, or null. Case-insensitive substring, which is
 * what someone half-remembering a name actually needs — not word boundaries, and
 * not fuzzy matching that would put every page in the list.
 */
export function matchPage(page: Page, query: string, fields: readonly Field[]): PageMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const inTitle = page.title.toLowerCase().indexOf(q);
  if (inTitle >= 0) {
    return { where: 'title', label: null, excerpt: excerptAt(page.title, inTitle, q.length) };
  }

  for (const field of fields) {
    const value = page.fields[field.key];
    if (!value) continue;
    const at = value.toLowerCase().indexOf(q);
    if (at >= 0) {
      return { where: 'field', label: field.label, excerpt: excerptAt(value, at, q.length) };
    }
  }

  const inBody = page.body.toLowerCase().indexOf(q);
  if (inBody >= 0) {
    return { where: 'body', label: null, excerpt: excerptAt(page.body, inBody, q.length) };
  }
  return null;
}
