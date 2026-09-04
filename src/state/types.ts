/** Cartographer document model. This is the on-disk format: `cartographer/v1`. */

export type FieldKind = 'text' | 'number' | 'long' | 'ref' | 'heading' | 'date';

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  /** Span the full width of the field grid. Implied for 'long' and 'heading'. */
  wide?: boolean;
}

/** A block type — creature, weapon, rule… User-defined, scoped to one project. */
export interface BlockType {
  label: string;
  /** Two-letter code shown on cards and rows. */
  code: string;
  /** Hex; chips derive fills from this with 22 / 55 / 1f / 14 alpha suffixes. */
  color: string;
  fields: Field[];
  /**
   * Kept in the project but not offered when making a page: no new-page menu entry,
   * no quick button, no slash command. Pages already using it keep working, so
   * hiding is the safe way to clear away a type you do not want without losing data.
   */
  hidden?: boolean;
}

/* ---------- world calendar ---------- */

export interface CalendarMonth {
  name: string;
  /** Days in a common year. A leap month gains one more; see LeapRule. */
  days: number;
}

/**
 * A moon, and where it is in its cycle.
 *
 * `cycle` is how many days a full new-to-new takes, and may be fractional — 29.5 is
 * the obvious one. `newMoonOn` is how many days after the calendar's origin (year 1,
 * first month, first day) this moon was last new, which is what fixes its phase to
 * the calendar rather than leaving it floating.
 */
export interface Moon {
  id: string;
  name: string;
  cycle: number;
  newMoonOn: number;
  /** Hex, so several moons stay tellable apart at a glance. */
  color: string;
}

/**
 * Gregorian-shaped leap rules, which cover far more invented calendars than they
 * look like they should: a day every `every` years, skipped every `skipEvery`,
 * un-skipped every `keepEvery`. Earth is 4 / 100 / 400. Set the last two to 0 for a
 * plain "every fourth year".
 */
export interface LeapRule {
  every: number;
  skipEvery: number;
  keepEvery: number;
  /** Index into `months` of the month that gains the day. */
  monthIndex: number;
}

/** One project's calendar. Travels with the project, like its schema. */
export interface WorldCalendar {
  name: string;
  months: CalendarMonth[];
  /** Names of the days of the week; the length of this list *is* the week length. */
  weekdays: string[];
  hoursPerDay: number;
  /** Suffix on a written year — "AR", "of the Third Age". */
  era: string;
  leap: LeapRule | null;
  moons: Moon[];
  /**
   * Where the world is now. Marks the timeline, and is what a new date starts on —
   * you are almost always writing about a date near the present, not near year 1.
   */
  today: WorldDate;
}

/**
 * A date in a world calendar. Month and day are 1-based, as they are when written.
 * Stored in a page field as `year-month-day`.
 */
export interface WorldDate {
  year: number;
  month: number;
  day: number;
}

export interface ProjectSchema {
  types: Record<string, BlockType>;
  /** Display order of type keys; 'blank' is always present and never shown in the schema grid. */
  typeOrder: string[];
  calendar: WorldCalendar;
}

export interface Project {
  id: string;
  name: string;
  /** Free-text subtitle, e.g. "TTRPG · system-agnostic". */
  system: string;
  /** Hex accent used by the home tile badge. */
  accent: string;
}

/**
 * A category in the rail — "NPCs", "Rules", "Locations". Holds boards, and sets the
 * block type new pages default to anywhere inside it. An area has no canvas of its
 * own; opening one shows the boards it contains.
 */
export interface Area {
  id: string;
  projectId: string;
  name: string;
  /** Block type new pages default to on any board in this area. */
  defaultType: string;
}

/**
 * One subject, and one canvas — "Cassiel Vane" inside the "NPCs" area. Boards hold
 * the pages. A board cannot exist outside an area.
 */
export interface Board {
  id: string;
  projectId: string;
  areaId: string;
  name: string;
}

/**
 * A page's reference to a stored image. The bytes live in the local asset store
 * under `id`; only this ref is ever written to the document, exported, or synced.
 */
export interface PageImage {
  id: string;
  name: string;
  /** Dimensions after import shrank it, so a card can reserve the right shape. */
  w: number;
  h: number;
  bytes: number;
}

/** One document. A page cannot exist off a board. */
export interface Page {
  id: string;
  projectId: string;
  boardId: string;
  type: string;
  title: string;
  /** World coordinates on its board's canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Field values keyed by Field.key. Stored as strings; coerce on read. */
  fields: Record<string, string>;
  /**
   * Per-page layout override. `null` = follow the block type's schema.
   * `[]` = a blank page with no elements yet.
   */
  custom: Field[] | null;
  /** Field-grid column count; 0 = auto-fill at minmax(168px, 1fr). */
  cols: 0 | 1 | 2 | 3 | 4;
  /** Markdown source. */
  body: string;
  /** Images attached to this page, in the order they were added. */
  images: PageImage[];
  /**
   * Which of `images` is the header — the one shown on the card and at the top of
   * the inspector. Null when the page has no images, or none has been chosen.
   */
  header: string | null;
  updated: number;
}

/**
 * 'wiki'   — derived from [[Title]] in Page.body. Recomputed on every body write.
 * 'field'  — derived from a 'ref' field value. Recomputed when that field changes.
 * 'manual' — authored by dragging a card port. Never derived; only the user deletes it.
 */
export type EdgeKind = 'wiki' | 'manual' | 'field';

export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface Doc {
  projects: Project[];
  areas: Area[];
  boards: Board[];
  pages: Page[];
  edges: Edge[];
  /** Schemas are per project — labels and types never leak between projects. */
  schemas: Record<string, ProjectSchema>;
}

/** Shape of an exported/imported single project file. */
export interface ProjectFile {
  format: 'cartographer/v1';
  project: Project;
  areas: Area[];
  boards: Board[];
  pages: Page[];
  types: Record<string, BlockType>;
  typeOrder: string[];
  /** Absent in files written before calendars existed; the importer fills one in. */
  calendar?: WorldCalendar;
  links: Edge[];
}

/** 'area' lists the boards in the selected area; 'board' is the page canvas. */
export type ViewMode = 'area' | 'board' | 'table' | 'timeline' | 'calendar' | 'schema';

export interface Camera {
  x: number;
  y: number;
  /** Clamped to 0.28 – 2.2. */
  z: number;
}
