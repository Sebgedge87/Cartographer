import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Sync is opt-in. With no credentials configured the app runs exactly as it always
 * has — local-only, no account, no network — so a missing .env is a supported mode,
 * not a broken one.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) throw new Error('Supabase is not configured');
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
