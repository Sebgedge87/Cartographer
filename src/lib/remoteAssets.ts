/**
 * Image bytes in Supabase Storage.
 *
 * The document syncs refs; this is what makes them mean something on the second
 * device. Everything here is best-effort by design: a failed upload leaves the
 * picture on the machine that imported it and a failed download leaves a
 * placeholder, and neither is worth interrupting someone's writing over. The
 * catch-up pass in `syncAssets` is what eventually makes them agree.
 */
import { supabase, syncConfigured } from './supabase';

export const BUCKET = 'assets';

/** Objects are filed under the owner's id, which is what the bucket's policy checks. */
function paths(userId: string, id: string) {
  return { full: `${userId}/${id}`, thumb: `${userId}/${id}-thumb` };
}

/** The signed-in user's id, or null when there is nowhere to put anything. */
async function owner(): Promise<string | null> {
  if (!syncConfigured) return null;
  try {
    const { data } = await supabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function uploadAsset(id: string, full: Blob, thumb: Blob): Promise<boolean> {
  const userId = await owner();
  if (!userId) return false;
  const at = paths(userId, id);
  try {
    const store = supabase().storage.from(BUCKET);
    // upsert, because a retry of a partly-finished upload must not fail on the
    // half that already landed.
    const [a, b] = await Promise.all([
      store.upload(at.full, full, { contentType: 'image/webp', upsert: true }),
      store.upload(at.thumb, thumb, { contentType: 'image/webp', upsert: true }),
    ]);
    return !a.error && !b.error;
  } catch {
    return false;
  }
}

/** Both sizes of one asset, or null if it is not there or cannot be reached. */
export async function downloadAsset(id: string): Promise<{ full: Blob; thumb: Blob } | null> {
  const userId = await owner();
  if (!userId) return null;
  const at = paths(userId, id);
  try {
    const store = supabase().storage.from(BUCKET);
    const [a, b] = await Promise.all([store.download(at.full), store.download(at.thumb)]);
    if (a.error || !a.data) return null;
    // A missing thumbnail is survivable: the full size stands in for it.
    return { full: a.data, thumb: b.data ?? a.data };
  } catch {
    return null;
  }
}

/** Ids already in the bucket, so a catch-up pass only uploads what is missing. */
export async function remoteAssetIds(): Promise<Set<string> | null> {
  const userId = await owner();
  if (!userId) return null;
  try {
    const out = new Set<string>();
    // Paged: the default page is 100, and a project can easily hold more.
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase().storage
        .from(BUCKET)
        .list(userId, { limit: 100, offset });
      if (error || !data) return out.size ? out : null;
      for (const object of data) {
        if (!object.name.endsWith('-thumb')) out.add(object.name);
      }
      if (data.length < 100) return out;
    }
  } catch {
    return null;
  }
}
