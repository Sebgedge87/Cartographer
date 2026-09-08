/**
 * Row-level change detection.
 *
 * A row's identity for this purpose is everything *except* its `updated` stamp: the
 * stamp is bookkeeping we attach at save time, so including it would make every row
 * look different on every scan and turn the whole document into a pending change.
 */

export type Keyed = { id: string };

/** The comparison key for a row: its content with the timestamp neutralised. */
export function rowKey(row: Keyed): string {
  return JSON.stringify({ ...(row as Record<string, unknown>), updated: 0 });
}

export interface TableDiff<T extends Keyed> {
  /** Rows whose content differs from the last known server state. */
  changed: T[];
  /** Ids the server has but this document no longer does. */
  gone: string[];
  /** The key map to adopt as the new baseline once these changes have landed. */
  next: Map<string, string>;
}

/** Compare the document's rows for one table against what the server last had. */
export function diffTable<T extends Keyed>(
  baseline: Map<string, string>,
  rows: readonly T[],
): TableDiff<T> {
  const next = new Map<string, string>();
  const changed: T[] = [];
  for (const row of rows) {
    const key = rowKey(row);
    next.set(row.id, key);
    if (baseline.get(row.id) !== key) changed.push(row);
  }
  const gone = [...baseline.keys()].filter((id) => !next.has(id));
  return { changed, gone, next };
}
