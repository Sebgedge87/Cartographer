/** Cartographer document model. This is the on-disk format: `cartographer/v1`. */

export type FieldKind = 'text' | 'number' | 'long' | 'ref' | 'heading';

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

export interface ProjectSchema {
  types: Record<string, BlockType>;
  /** Display order of type keys; 'blank' is always present and never shown in the schema grid. */
  typeOrder: string[];
}

export interface Project {
  id: string;
  name: string;
  /** Free-text subtitle, e.g. "TTRPG · system-agnostic". */
  system: string;
  /** Hex accent used by the home tile badge. */
  accent: string;
}

/** A tab in the left "Pages" rail, and one board. */
export interface Area {
  id: string;
  projectId: string;
  name: string;
  /** Block type new pages in this area get by default. */
  defaultType: string;
}

export interface Page {
  id: string;
  projectId: string;
  areaId: string;
  type: string;
  title: string;
  /** World coordinates on the area's board. */
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
  pages: Page[];
  types: Record<string, BlockType>;
  typeOrder: string[];
  links: Edge[];
}

export type ViewMode = 'board' | 'table' | 'schema';

export interface Camera {
  x: number;
  y: number;
  /** Clamped to 0.28 – 2.2. */
  z: number;
}
