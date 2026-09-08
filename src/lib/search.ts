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
  /** Title matches rank first, then tags, then fields, then the body. */
  where: 'title' | 'tag' | 'field' | 'body' | 'orphan' | 'recent';
  /** The field's label, when the match was in a field value. */
  label: string | null;
  /** The text the query was found in. Null for the `is:` filters, which match no text. */
  excerpt: Excerpt | null;
  /** Why this page is listed, when there is no excerpt to show instead. */
  note?: string;
}

/**
 * What the box is asking for.
 *
 * `is:orphan` and `is:recent` answer two questions the tree cannot: what have I
 * written that connects to nothing, and what was I working on last. They ride on
 * the search box rather than earning views of their own — one place to type, and
 * the chips beneath it make them findable.
 */
export type Query =
  | { kind: 'text'; text: string }
  | { kind: 'orphan' }
  | { kind: 'recent' };

/** How far back `is:recent` reaches. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export function parseQuery(raw: string): Query | null {
  const q = raw.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  if (lower === 'is:orphan') return { kind: 'orphan' };
  if (lower === 'is:recent') return { kind: 'recent' };
  return { kind: 'text', text: q };
}

/** "just now", "3 hours ago", "2 days ago" — enough to recognise your own session. */
export function ago(then: number, now: number): string {
  const ms = Math.max(0, now - then);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
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
  const raw = query.trim();
  if (!raw) return null;

  /*
   * A leading # searches tags and nothing else. Tags are the one axis that cuts
   * across the hierarchy, so narrowing to them is worth a shorthand — and it is
   * how the tag chips themselves search when you click one.
   */
  if (raw.startsWith('#')) {
    const wanted = raw.slice(1).trim().toLowerCase();
    if (!wanted) return null;
    const tag = page.tags.find((t) => t.toLowerCase().includes(wanted));
    return tag
      ? { where: 'tag', label: null, excerpt: excerptAt(tag, tag.toLowerCase().indexOf(wanted), wanted.length) }
      : null;
  }

  const q = raw.toLowerCase();
  const inTitle = page.title.toLowerCase().indexOf(q);
  if (inTitle >= 0) {
    return { where: 'title', label: null, excerpt: excerptAt(page.title, inTitle, q.length) };
  }

  for (const tag of page.tags) {
    const at = tag.toLowerCase().indexOf(q);
    if (at >= 0) return { where: 'tag', label: null, excerpt: excerptAt(tag, at, q.length) };
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
