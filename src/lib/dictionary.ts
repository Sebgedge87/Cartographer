/**
 * A project's own vocabulary.
 *
 * Every invented name in a setting has already been typed once, as a page title, an
 * area, a block type or a month. Harvesting those means the spellchecker knows
 * "Dawnguard" the moment the keep exists, instead of underlining it in every page
 * that mentions it until someone adds it by hand.
 *
 * Seeded words are derived, never stored: rename the keep and the old name stops
 * being known, which is the behaviour you want. Words the user adds explicitly are
 * stored on the project schema and travel with it.
 */
import type { Doc } from '../state/types';
import { wordsIn } from './words';

/** Case-insensitively unique, in first-seen order — the list is a set, not a report. */
function unique(words: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/** Every word one project has already named something with. */
export function projectVocabulary(doc: Doc, projectId: string): string[] {
  const names: string[] = [];
  const project = doc.projects.find((p) => p.id === projectId);
  if (project) names.push(project.name, project.system);
  for (const area of doc.areas) if (area.projectId === projectId) names.push(area.name);
  for (const board of doc.boards) if (board.projectId === projectId) names.push(board.name);
  for (const page of doc.pages) if (page.projectId === projectId) names.push(page.title);

  const schema = doc.schemas[projectId];
  if (schema) {
    for (const type of Object.values(schema.types)) {
      names.push(type.label);
      for (const field of type.fields) names.push(field.label);
    }
    const cal = schema.calendar;
    if (cal) {
      names.push(cal.name, cal.era);
      for (const month of cal.months) names.push(month.name);
      for (const weekday of cal.weekdays) names.push(weekday);
      for (const moon of cal.moons) names.push(moon.name);
    }
  }
  // Per-page elements are a page's own layout, so their labels are invented too.
  for (const page of doc.pages) {
    if (page.projectId !== projectId || !page.custom) continue;
    for (const field of page.custom) names.push(field.label);
  }

  return unique(names.flatMap(wordsIn));
}

/** What the checker is told to accept: the project's own names, plus added words. */
export function knownWords(doc: Doc, projectId: string, added: string[]): string[] {
  return unique([...projectVocabulary(doc, projectId), ...added]);
}
