/**
 * Rewriting references when a page is renamed.
 *
 * Links resolve by title, so renaming a page used to quietly break every `[[Old
 * Name]]` pointing at it: the wiki edges vanished, the backlinks list emptied, and
 * the reference turned into a create-this-page chip. Nothing said so.
 *
 * The four reference syntaxes markdown.ts renders all name a page by title, and all
 * four are rewritten here. Code is left alone — a fenced block showing the syntax
 * is documentation, not a link.
 */

/** Fenced and inline code, which the renderer never treats as a reference either. */
const CODE = new RegExp(
  [
    /```[\s\S]*?(?:```|$)/,
    /~~~[\s\S]*?(?:~~~|$)/,
    /`[^`\n]*`/,
  ].map((r) => r.source).join('|'),
  'g',
);

/**
 * The reference forms, in the same order and with the same grammar as the renderer:
 * `![[Page]]` and `[[Page]]`, then `@@Page`, then `@Page.field`.
 */
const REFS = new RegExp(
  [
    /(!?)\[\[([^\]\n]+)\]\]/,
    /@@([A-Za-z0-9'’\- ]+)/,
    /@([A-Za-z0-9'’\- ]+?)\.([a-z_]+)/,
  ].map((r) => r.source).join('|'),
  'g',
);

/** Titles the undelimited `@@Page` form is able to name at all. */
const NAMEABLE = /^[A-Za-z0-9'’\- ]+$/;

export interface Retitled {
  body: string;
  /** How many references were rewritten. */
  changed: number;
  /**
   * References left as they were because the new title cannot be written in that
   * syntax — `@@Page` has no closing delimiter, so it can only name a title made of
   * letters, digits, spaces, hyphens and apostrophes.
   */
  skipped: number;
}

function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  CODE.lastIndex = 0;
  for (let m = CODE.exec(text); m; m = CODE.exec(text)) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) CODE.lastIndex++;
  }
  return out;
}

/**
 * `@@Page` swallows the rest of the sentence, so the renderer walks back word by
 * word to the longest run that is a real title. Rewriting has to resolve it the
 * same way, against the titles as they were *before* the rename — otherwise a
 * reference to "Watch" inside "@@Watchtower Keep" would be missed or mistaken.
 */
function longestTitle(text: string, titles: Set<string>): string | null {
  let candidate = text.trimEnd();
  while (candidate.length) {
    if (titles.has(candidate.toLowerCase())) return candidate;
    const cut = candidate.lastIndexOf(' ');
    if (cut < 0) return null;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

/**
 * Point every reference to `from` at `to`.
 *
 * `titles` is every page title in the project as it stood before the rename,
 * lower-cased, which is what the undelimited `@@Page` form needs to resolve.
 */
export function retitleBody(body: string, from: string, to: string, titles: Set<string>): Retitled {
  if (!body || from === to) return { body, changed: 0, skipped: 0 };
  const target = from.trim().toLowerCase();
  if (!target) return { body, changed: 0, skipped: 0 };

  const code = codeRanges(body);
  const inCode = (at: number, end: number) =>
    code.some(([s, e]) => at < e && s < end);

  let out = '';
  let last = 0;
  let changed = 0;
  let skipped = 0;

  REFS.lastIndex = 0;
  for (let m = REFS.exec(body); m; m = REFS.exec(body)) {
    const [whole, bang, bracket, statline, refName, refField] = m;
    let consumed = whole.length;
    let replacement: string | null = null;

    if (bracket !== undefined) {
      if (bracket.trim().toLowerCase() === target) replacement = `${bang ?? ''}[[${to}]]`;
    } else if (statline !== undefined) {
      // Only the resolved prefix belongs to the reference; the rest is prose.
      const resolved = longestTitle(statline, titles);
      if (resolved && resolved.toLowerCase() === target) {
        consumed = 2 + resolved.length;
        if (NAMEABLE.test(to)) replacement = `@@${to}`;
        else skipped++;
      }
    } else if (refName !== undefined) {
      if (refName.trim().toLowerCase() === target) {
        if (NAMEABLE.test(to)) replacement = `@${to}.${refField ?? ''}`;
        else skipped++;
      }
    }

    if (replacement !== null && !inCode(m.index, m.index + consumed)) {
      out += body.slice(last, m.index) + replacement;
      last = m.index + consumed;
      changed++;
    }
    REFS.lastIndex = m.index + consumed;
  }

  return { body: out + body.slice(last), changed, skipped };
}
