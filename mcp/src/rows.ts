/**
 * The shape of Cartographer's rows, as the database holds them.
 *
 * Deliberately a separate copy from the app's src/state/sync/rows.ts rather than an
 * import: this package builds on its own, ships on its own, and must not drag a
 * browser bundle's imports behind it. The two agree because supabase/schema.sql is
 * the thing both are written against — that file is the contract, not either copy.
 */

export interface ProjectRow {
  id: string;
  name: string;
  system: string;
  accent: string;
  types: Record<string, BlockType>;
  type_order: string[];
  calendar: unknown;
  dictionary: string[] | null;
  sheet: string | null;
  updated: number;
}

export interface BlockType {
  label: string;
  code: string;
  color: string;
  fields: Field[];
  hidden?: boolean;
}

export interface Field {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'long' | 'ref' | 'heading' | 'date' | 'select';
  wide?: boolean;
  options?: string[];
}

export interface AreaRow {
  id: string;
  project_id: string;
  name: string;
  default_type: string;
  updated: number;
}

export interface BoardRow {
  id: string;
  project_id: string;
  area_id: string;
  name: string;
  updated: number;
}

export interface PageRow {
  id: string;
  project_id: string;
  board_id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fields: Record<string, string>;
  custom: Field[] | null;
  cols: number;
  body: string;
  tags: string[] | null;
  images: unknown[];
  header: string | null;
  updated: number;
}

export interface EdgeRow {
  id: string;
  project_id: string;
  from_page: string;
  to_page: string;
  kind: 'wiki' | 'manual' | 'field';
  updated: number;
}

/** Ids the app generates are short random strings, and the database takes them as given. */
export function newId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 8);
}

/** The card size a new page gets, matching what the board lays out. */
export const CARD_W = 244;
export const CARD_H = 116;
