import { supabase, syncConfigured } from '../../lib/supabase';
import { useSync } from '../syncStore';
import { startSync, stopSync } from './engine';

/**
 * Watch the session and run the sync engine for exactly as long as someone is
 * signed in. Supabase persists the session and refreshes the token itself, so this
 * survives reloads without asking for a password again.
 */
export function watchAuth(): void {
  if (!syncConfigured) {
    useSync.getState().set({ status: 'off' });
    return;
  }
  const db = supabase();

  void db.auth.getSession().then(({ data }) => {
    if (data.session) {
      useSync.getState().set({ email: data.session.user.email ?? null });
      void startSync();
    } else {
      useSync.getState().set({ status: 'signed-out' });
    }
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      useSync.getState().set({ status: 'signed-out', email: null, error: null });
      void stopSync();
      return;
    }
    useSync.getState().set({ email: session.user.email ?? null });
    void startSync();
  });
}

/** "Failed to fetch" tells the user nothing; name the actual situation. */
function readable(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the sync server. Check the connection, or work offline for now.';
  }
  return message;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    return error ? readable(error.message) : null;
  } catch (e) {
    return readable(e instanceof Error ? e.message : String(e));
  }
}

export async function signUp(email: string, password: string): Promise<string | null> {
  try {
    const { data, error } = await supabase().auth.signUp({ email, password });
    if (error) return readable(error.message);
    // With email confirmation switched on, Supabase returns a user but no session.
    if (!data.session) return 'Check your email to confirm the account, then sign in.';
    return null;
  } catch (e) {
    return readable(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Hand off to Google and come back signed in.
 *
 * The redirect returns to whatever page started it, which is the app's own URL
 * rather than a route it has to own — Supabase puts the session in the URL and its
 * client picks it up on load, so `watchAuth` sees a session and starts syncing with
 * nothing else to arrange.
 *
 * Nothing here needs a Google client id: the id and secret live in the Supabase
 * project, and the browser only ever talks to Supabase.
 */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('#')[0] },
    });
    return error ? readable(error.message) : null;
  } catch (e) {
    return readable(e instanceof Error ? e.message : String(e));
  }
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}
