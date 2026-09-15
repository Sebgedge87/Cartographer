/**
 * Deciding which bucket objects are dead.
 *
 * Kept apart from assets.ts so it can be tested without dragging in the Supabase
 * client, which reads import.meta.env and cannot be loaded outside a bundle.
 */

/**
 * How long a bucket object must have existed before the reaper will consider it.
 *
 * Belt and braces rather than the real protection. Deleting a still-referenced
 * object is self-healing: the device that references it finds it missing on its
 * next catch-up and uploads it again from its own store, and the local sweep only
 * ever drops blobs nothing local refers to, so the bytes cannot go missing
 * everywhere at once. The window simply keeps a freshly imported picture out of
 * reach of a device whose document is a few minutes behind.
 */
export const REAP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Which bucket objects are safe to remove: referenced by nothing, and old enough
 * that no device's document is plausibly still catching up to them.
 */
export function reapable(
  remote: ReadonlyMap<string, number>,
  wanted: ReadonlySet<string>,
  now: number,
  graceMs: number = REAP_AFTER_MS,
): string[] {
  const dead: string[] = [];
  for (const [id, created] of remote) {
    if (wanted.has(id)) continue;
    // Strictly older than the window, not merely equal to it: where the choice is
    // between keeping a byte too long and deleting it a moment early, keep it.
    // A created_at ahead of this clock gives a negative age; that is "new", not old.
    if (now - created <= graceMs) continue;
    dead.push(id);
  }
  return dead;
}
