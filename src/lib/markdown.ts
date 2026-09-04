import MarkdownIt from 'markdown-it';
import type { BlockType, Field, Page } from '../state/types';
import { assetIdFromSrc, assetUrl } from './assets';

type Token = ReturnType<MarkdownIt['parse']>[number];

/** Everything the custom inline rules need to resolve a page reference. */
export interface MarkdownContext {
  /** Lower-cased page title -> page id, scoped to the current project. */
  byTitle: Map<string, string>;
  byId: Map<string, Page>;
  typeOf: (typeKey: string) => BlockType;
  /** The fields a page actually shows — its own layout if it has forked, else its type's. */
  fieldsOf: (page: Page) => Field[];
}

const EMPTY_CONTEXT: MarkdownContext = {
  byTitle: new Map(),
  byId: new Map(),
  typeOf: () => ({ label: 'Note', code: 'NT', color: '#8a919e', fields: [] }),
  fieldsOf: () => [],
};

let context: MarkdownContext = EMPTY_CONTEXT;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wikilink, live stat reference and dice, in that order. These triggers are not
 * markdown-it terminator characters, so they are matched in a core pass over the
 * text tokens the inline rules left behind — which also means they can never fire
 * inside a code span, a link href or an image alt.
 */
const INLINE = new RegExp(
  [
    /!\[\[([^\]\n]+)\]\]/,                        // ![[Page]]  — embedded stat block
    /\[\[([^\]\n]+)\]\]/,                          // [[Page]]   — link
    /@@([A-Za-z0-9'’\- ]+)/,                         // @@Page     — inline stat line
    /@([A-Za-z0-9'’\- ]+?)\.([a-z_]+)/,              // @Page.field
    /\b(\d{0,3}d\d{1,3}(?:[+-]\d{1,3})?)\b/,        // 2d6+3
  ].map((r) => r.source).join('|'),
  'g',
);

const md: MarkdownIt = new MarkdownIt({
  // Author-entered HTML is never trusted: markdown-it escapes it, and every custom
  // renderer below escapes its own interpolations, so the output needs no extra pass.
  html: false,
  linkify: false,
  breaks: false,
});

/* ---------- custom tokens ---------- */

/**
 * The longest leading run of `text` that names a page, trimmed at word boundaries.
 * Returns null when no prefix matches, so `@@` before ordinary prose stays prose.
 */
function longestKnownTitle(text: string): string | null {
  let candidate = text.trimEnd();
  while (candidate.length) {
    if (context.byTitle.has(candidate.toLowerCase())) return candidate;
    const cut = candidate.lastIndexOf(' ');
    if (cut < 0) return null;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

md.core.ruler.push('cartographer_inline', (state) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const next: Token[] = [];
    for (const child of block.children) {
      if (child.type !== 'text' || !INLINE.test(child.content)) {
        INLINE.lastIndex = 0;
        next.push(child);
        continue;
      }
      INLINE.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = INLINE.exec(child.content))) {
        if (m.index > last) {
          const t = new state.Token('text', '', 0);
          t.content = child.content.slice(last, m.index);
          next.push(t);
        }
        const [, embed, link, statline, refName, refField, dice] = m;

        // `@@Name` has no closing delimiter, so the pattern greedily eats the rest of
        // the sentence. Walk back word by word to the longest run that is a real page
        // title, and hand the remainder back to the text that follows.
        let consumed = m[0].length;
        let resolved: string | null | undefined = statline;
        if (statline !== undefined) {
          resolved = longestKnownTitle(statline);
          if (resolved === null) {
            const text = new state.Token('text', '', 0);
            text.content = m[0];
            next.push(text);
            last = m.index + m[0].length;
            continue;
          }
          consumed = 2 + resolved.length;
          INLINE.lastIndex = m.index + consumed;
        }

        const type =
          embed ? 'cg_embed'
            : link ? 'cg_wikilink'
            : statline !== undefined ? 'cg_statline'
            : dice ? 'cg_dice'
            : 'cg_stat';
        const token = new state.Token(type, '', 0);
        token.content = m[0].slice(0, consumed);
        token.meta =
          embed ? { name: embed.trim() }
            : link ? { name: link.trim() }
            : statline !== undefined ? { name: (resolved ?? '').trim() }
            : dice ? { expr: dice }
            : { name: (refName ?? '').trim(), field: refField ?? '' };
        next.push(token);
        last = m.index + consumed;
      }
      if (last < child.content.length) {
        const t = new state.Token('text', '', 0);
        t.content = child.content.slice(last);
        next.push(t);
      }
    }
    block.children = next;
  }
  return true;
});

/**
 * `- [ ] thing` / `- [x] thing` become real checkboxes. The source line index rides
 * on the token so a click in the preview can toggle that exact line of the body.
 */
md.core.ruler.push('cartographer_tasks', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]?.type !== 'list_item_open') continue;
    const inline = tokens[i + 2];
    if (!inline || inline.type !== 'inline') continue;

    const m = /^\[([ xX])\]\s+/.exec(inline.content);
    if (!m) continue;

    inline.content = inline.content.slice(m[0].length);
    const first = inline.children?.[0];
    if (first && first.type === 'text') first.content = first.content.replace(/^\[[ xX]\]\s+/, '');

    const box = new state.Token('cg_task', '', 0);
    box.meta = { checked: m[1] !== ' ', line: inline.map?.[0] ?? -1 };
    inline.children = [box, ...(inline.children ?? [])];
    tokens[i]!.attrJoin('class', 'cg-task');
  }
  return true;
});

/** `> [!gm] …` / `> [!note] …` become tagged callouts rather than plain quotes. */
md.core.ruler.push('cartographer_callout', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (!open || open.type !== 'blockquote_open') continue;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (!t || t.type === 'blockquote_close') break;
      if (t.type !== 'inline') continue;
      const m = /^\[!(\w+)\]\s*/.exec(t.content);
      if (m) {
        open.attrSet('data-callout', (m[1] ?? '').toUpperCase());
        t.content = t.content.slice(m[0].length);
        const first = t.children?.[0];
        if (first && first.type === 'text') first.content = first.content.replace(/^\[!\w+\]\s*/, '');
      }
      break;
    }
  }
  return true;
});

/* ---------- renderers ---------- */

md.renderer.rules.cg_wikilink = (tokens, idx) => {
  const name = String(tokens[idx]?.meta?.name ?? '');
  const id = context.byTitle.get(name.toLowerCase());
  const page = id ? context.byId.get(id) : undefined;
  if (!page) {
    // Unresolved: clicking it creates the page under that exact title.
    return `<span class="cg-link cg-link--new" data-new="${esc(name)}">${esc(name)} +</span>`;
  }
  const t = context.typeOf(page.type);
  return (
    `<span class="cg-link" data-page="${esc(page.id)}" style="--chip:${esc(t.color)}">` +
    `<b>${esc(t.code)}</b>${esc(page.title)}</span>`
  );
};

md.renderer.rules.cg_stat = (tokens, idx) => {
  const token = tokens[idx];
  const name = String(token?.meta?.name ?? '');
  const field = String(token?.meta?.field ?? '');
  const id = context.byTitle.get(name.toLowerCase());
  const page = id ? context.byId.get(id) : undefined;
  // Unresolved references stay as literal text rather than becoming a dead chip.
  if (!page) return esc(String(token?.content ?? ''));
  const t = context.typeOf(page.type);
  const value = page.fields[field];
  return (
    `<span class="cg-stat" data-page="${esc(page.id)}" style="--chip:${esc(t.color)}">` +
    `<span>${esc(field)}</span><b>${esc(value == null || value === '' ? '—' : value)}</b></span>`
  );
};

/** The target page's whole stat block, rendered inline where it was referenced. */
md.renderer.rules.cg_embed = (tokens, idx) => {
  const name = String(tokens[idx]?.meta?.name ?? '');
  const id = context.byTitle.get(name.toLowerCase());
  const page = id ? context.byId.get(id) : undefined;
  if (!page) return `<span class="cg-link cg-link--new" data-new="${esc(name)}">${esc(name)} +</span>`;

  const t = context.typeOf(page.type);
  const rows = context
    .fieldsOf(page)
    .filter((f) => f.kind !== 'heading' && (page.fields[f.key] ?? '') !== '')
    .map(
      (f) =>
        `<span class="cg-embed__cell"><em>${esc(f.label)}</em>` +
        `<b>${esc(page.fields[f.key] ?? '')}</b></span>`,
    )
    .join('');

  return (
    `<span class="cg-embed" data-page="${esc(page.id)}" style="--chip:${esc(t.color)}">` +
    `<span class="cg-embed__head"><b>${esc(t.code)}</b>${esc(page.title)}</span>` +
    (rows
      ? `<span class="cg-embed__grid">${rows}</span>`
      : '<span class="cg-embed__empty">No fields filled in</span>') +
    '</span>'
  );
};

/** The same stat block squeezed onto one line, for use mid-sentence. */
md.renderer.rules.cg_statline = (tokens, idx) => {
  const token = tokens[idx];
  const name = String(token?.meta?.name ?? '');
  const id = context.byTitle.get(name.toLowerCase());
  const page = id ? context.byId.get(id) : undefined;
  if (!page) return esc(String(token?.content ?? ''));

  const t = context.typeOf(page.type);
  const parts = context
    .fieldsOf(page)
    .filter((f) => f.kind !== 'heading' && f.kind !== 'long' && (page.fields[f.key] ?? '') !== '')
    // Clipped like the board card's stat chips: this form is meant to sit inside a
    // sentence, and a long value pushes it onto a second line.
    .map((f) => {
      const value = page.fields[f.key] ?? '';
      const short = value.length > 22 ? `${value.slice(0, 22)}…` : value;
      return `<em>${esc(f.label)}</em> <b>${esc(short)}</b>`;
    });

  return (
    `<span class="cg-statline" data-page="${esc(page.id)}" style="--chip:${esc(t.color)}">` +
    (parts.length ? parts.join('<i>·</i>') : `<em>${esc(page.title)}</em>`) +
    '</span>'
  );
};

md.renderer.rules.cg_dice = (tokens, idx) => {
  const expr = String(tokens[idx]?.meta?.expr ?? '');
  return `<span class="cg-dice" data-dice="${esc(expr)}" title="Click to roll">${esc(expr)}</span>`;
};

md.renderer.rules.cg_task = (tokens, idx) => {
  const meta = tokens[idx]?.meta ?? {};
  const checked = meta.checked ? ' checked' : '';
  return `<input type="checkbox" class="cg-check" data-task="${Number(meta.line)}"${checked} />`;
};

md.renderer.rules.blockquote_open = (tokens, idx) => {
  const tag = tokens[idx]?.attrGet('data-callout');
  const cls =
    tag === 'GM' ? 'cg-quote cg-quote--gm'
      : tag === 'WARNING' ? 'cg-quote cg-quote--warning'
      : 'cg-quote';
  return `<div class="${cls}">` + (tag ? `<div class="cg-quote-tag">${esc(tag)}</div>` : '');
};
md.renderer.rules.blockquote_close = () => '</div>';

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx]?.attrSet('target', '_blank');
  tokens[idx]?.attrSet('rel', 'noreferrer noopener');
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx];
  const src = token?.attrGet('src') ?? '';
  const alt = token?.content ?? '';
  if (!src || src === 'image-url') {
    return `<span class="cg-image-placeholder">IMAGE PLACEHOLDER · ${esc(alt || 'drop a file')}</span>`;
  }
  const assetId = assetIdFromSrc(src);
  if (assetId) {
    // Resolved from the already-loaded cache: rendering is synchronous, so the
    // caller preloads and re-renders rather than this reaching for the blob.
    const url = assetUrl(assetId);
    if (!url) {
      return `<span class="cg-image-placeholder">IMAGE MISSING · ${esc(alt || assetId)}</span>`;
    }
    return `<img class="cg-image" src="${esc(url)}" alt="${esc(alt)}" data-asset="${esc(assetId)}" />`;
  }
  return `<img class="cg-image" src="${esc(src)}" alt="${esc(alt)}" />`;
};

/** Asset ids referenced by `![](asset:…)` in a body, so a caller knows what to preload. */
export function assetRefs(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/!\[[^\]]*\]\(asset:([A-Za-z0-9_]+)\)/g)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/* ---------- api ---------- */

/**
 * Render markdown to HTML. The result is inserted with `dangerouslySetInnerHTML`,
 * which is safe here because raw HTML is disabled, link hrefs go through
 * markdown-it's `validateLink`, and every custom renderer escapes its own values.
 */
export function renderMarkdown(source: string, ctx: MarkdownContext): string {
  context = ctx;
  try {
    return md.render(source ?? '');
  } finally {
    context = EMPTY_CONTEXT;
  }
}

/** Build the resolution context for one project. */
export function markdownContext(
  pages: Page[],
  projectId: string | null,
  typeOf: (typeKey: string) => BlockType,
  fieldsOf: (page: Page) => Field[],
): MarkdownContext {
  const byTitle = new Map<string, string>();
  const byId = new Map<string, Page>();
  for (const p of pages) {
    if (projectId && p.projectId !== projectId) continue;
    byTitle.set(p.title.toLowerCase(), p.id);
    byId.set(p.id, p);
  }
  return { byTitle, byId, typeOf, fieldsOf };
}

/** Strip markdown furniture down to a one-line preview for a board card. */
export function plainSnippet(body: string, max = 96): string {
  return body.replace(/[#*>[\]`|]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Flip `- [ ]` and `- [x]` on one line of a body. The preview reports which line was
 * clicked, so the source stays the single copy of the truth.
 */
export function toggleTaskLine(body: string, line: number): string {
  const lines = body.split('\n');
  const target = lines[line];
  if (target === undefined) return body;
  lines[line] = /^(\s*[-*+]\s+)\[ \]/.test(target)
    ? target.replace(/^(\s*[-*+]\s+)\[ \]/, '$1[x]')
    : target.replace(/^(\s*[-*+]\s+)\[[xX]\]/, '$1[ ]');
  return lines[line] === target ? body : lines.join('\n');
}
