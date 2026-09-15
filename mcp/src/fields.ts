import type { BlockType, Field, PageRow } from './rows.js';

/**
 * A page follows its block type's schema unless it has been given its own layout.
 * `custom: null` means "follow the type"; `[]` means "a page with no elements".
 */
export function effectiveFields(page: PageRow, type: BlockType | undefined): Field[] {
  return page.custom !== null ? page.custom : type?.fields ?? [];
}

/**
 * Resolve what someone called a field to the key the row is stored under.
 *
 * Field values are keyed by an opaque key ("f3k9x", "hp") while the label is what
 * anyone reads or says. Accepting either, case-insensitively, is the difference
 * between a tool that works when asked for "Hit points" and one that silently
 * writes a field nothing displays.
 */
export function resolveFieldKey(fields: readonly Field[], wanted: string): string | null {
  const want = wanted.trim().toLowerCase();
  for (const f of fields) if (f.key.toLowerCase() === want) return f.key;
  for (const f of fields) if (f.label.trim().toLowerCase() === want) return f.key;
  return null;
}

/** Field values as labels, which is what is worth showing rather than opaque keys. */
export function labelledFields(
  page: PageRow,
  type: BlockType | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of effectiveFields(page, type)) {
    if (field.kind === 'heading') continue;
    const value = page.fields[field.key];
    if (value) out[field.label] = value;
  }
  return out;
}

/**
 * Turn a caller's { label or key: value } into { key: value }, reporting anything
 * that names no field on this page rather than writing it into the void.
 */
export function mapFieldValues(
  fields: readonly Field[],
  input: Record<string, string>,
): { values: Record<string, string>; unknown: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, value] of Object.entries(input)) {
    const key = resolveFieldKey(fields, name);
    if (key === null) missing.push(name);
    else values[key] = value;
  }
  return { values, unknown: missing };
}
