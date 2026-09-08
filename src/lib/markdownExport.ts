import type { Doc, Field, Page, ProjectSchema } from '../state/types';
import { effectiveFields } from '../state/graph';
import { formatDate, parseDate } from './calendar';

/**
 * A project as one Markdown document.
 *
 * JSON was the only way out, which is fine for moving a project between copies of
 * this app and useless for reading, printing, or handing a location description to
 * someone. Structure follows the tree — area, board, page — because that is the
 * shape the project was written in.
 *
 * Bodies are the author's own text and are copied verbatim, with one exception:
 * `@@Page` and `@Page.field` render as live values in the app and as nothing at all
 * anywhere else, so they are resolved on the way out. `[[Page]]` and `![[Page]]`
 * are left as they are — that syntax means the same thing in other tools.
 */

const STAT = /@@([A-Za-z0-9'’\- ]+)|@([A-Za-z0-9'’\- ]+?)\.([a-z_]+)/g;

/** The value to print for one field, resolved for the kinds that are not plain text. */
function readable(page: Page, field: Field, doc: Doc, schema: ProjectSchema | undefined): string {
  const raw = page.fields[field.key] ?? '';
  if (!raw) return '';
  if (field.kind === 'ref') return doc.pages.find((p) => p.id === raw)?.title ?? raw;
  if (field.kind === 'date' && schema?.calendar) {
    const date = parseDate(raw);
    return date ? formatDate(schema.calendar, date) : raw;
  }
  return raw;
}

/** Longest matching title first, the way the renderer resolves an undelimited `@@Page`. */
function longestTitle(text: string, titles: Map<string, Page>): Page | null {
  let candidate = text.trimEnd();
  while (candidate.length) {
    const hit = titles.get(candidate.toLowerCase());
    if (hit) return hit;
    const cut = candidate.lastIndexOf(' ');
    if (cut < 0) return null;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

function resolveStats(body: string, titles: Map<string, Page>, doc: Doc, schema: ProjectSchema | undefined): string {
  STAT.lastIndex = 0;
  let out = '';
  let last = 0;
  for (let m = STAT.exec(body); m; m = STAT.exec(body)) {
    const [whole, statline, refName, refField] = m;
    let consumed = whole.length;
    let text: string | null = null;

    if (statline !== undefined) {
      const page = longestTitle(statline, titles);
      if (page) {
        consumed = 2 + page.title.length;
        text = `**${page.title}**`;
      }
    } else if (refName !== undefined) {
      const page = titles.get(refName.trim().toLowerCase());
      const type = page ? schema?.types[page.type] : undefined;
      const field = page
        ? effectiveFields(page, type?.fields ?? []).find((f) => f.key === refField)
        : undefined;
      // Without the page or the field there is no value to stand in for it, so the
      // reference is left visible rather than replaced by a blank.
      if (page && field) text = `**${readable(page, field, doc, schema) || '—'}**`;
    }

    if (text !== null) {
      out += body.slice(last, m.index) + text;
      last = m.index + consumed;
    }
    STAT.lastIndex = m.index + consumed;
  }
  return out + body.slice(last);
}

/** Table cells cannot carry a raw pipe or a line break. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function projectToMarkdown(doc: Doc, projectId: string): string | null {
  const project = doc.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const schema = doc.schemas[projectId];
  const pages = doc.pages.filter((p) => p.projectId === projectId);
  const titles = new Map(pages.map((p) => [p.title.toLowerCase(), p]));

  const out: string[] = [`# ${project.name}`];
  // 'Untitled' is the placeholder a new project is given, not something anyone
  // typed, and printing it as the document's subtitle just looks like a mistake.
  if (project.system && project.system !== 'Untitled') out.push(`*${project.system}*`);

  for (const area of doc.areas.filter((a) => a.projectId === projectId)) {
    out.push(`\n## ${area.name}`);
    for (const board of doc.boards.filter((b) => b.areaId === area.id)) {
      out.push(`\n### ${board.name}`);
      // Reading order down the board, then across, so the document runs the way the
      // canvas does rather than in whatever order the pages happen to be stored.
      const onBoard = pages
        .filter((p) => p.boardId === board.id)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      if (!onBoard.length) out.push('\n*No pages.*');

      for (const page of onBoard) {
        const type = schema?.types[page.type];
        out.push(`\n#### ${page.title}`);
        if (type) out.push(`\n\`${type.label}\``);
        if (page.tags.length) out.push(`\n${page.tags.map((t) => `\`#${t}\``).join(' ')}`);

        const rows = effectiveFields(page, type?.fields ?? [])
          .filter((f) => f.kind !== 'heading')
          .map((f) => [f.label, readable(page, f, doc, schema)] as const)
          .filter(([, value]) => value !== '');
        if (rows.length) {
          out.push('\n| Field | Value |\n| --- | --- |');
          for (const [label, value] of rows) out.push(`| ${cell(label)} | ${cell(value)} |`);
        }

        const body = page.body.trim();
        if (body) out.push(`\n${resolveStats(body, titles, doc, schema)}`);
      }
    }
  }

  return `${out.join('\n')}\n`;
}
