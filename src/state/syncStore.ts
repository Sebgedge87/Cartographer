import { create } from 'zustand';

export type SyncStatus =
  /** No credentials configured — local-only, and that is a supported mode. */
  | 'off'
  | 'signed-out'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'error';

/**
 * Working offline is no longer a remembered decision.
 *
 * It used to be kept in this browser, which made it a permanent bypass: one press
 * and the sign-in screen never appeared again. With the app behind a login that is
 * the wrong shape — so it now lasts for the session only, and is offered solely
 * when the server cannot be reached, because refusing someone their own local work
 * during an outage would be worse than the outage.
 *
 * The old key is cleared on load so a choice made before this still has to sign in.
 */
const OFFLINE_KEY = 'cartographer.offline';

function forgetStoredOffline(): void {
  try {
    localStorage.removeItem(OFFLINE_KEY);
  } catch {
    /* private mode; there was nothing remembered to forget */
  }
}

interface SyncState {
  status: SyncStatus;
  email: string | null;
  error: string | null;
  /** When the last successful push or pull completed. */
  lastSyncedAt: number | null;
  /**
   * Rows edited on this device that the server has not got yet. They are already
   * safe in local storage; this is how many are waiting for the next save.
   */
  pending: number;
  /**
   * Working on this device without signing in, for this session only. Offered when
   * the server cannot be reached, never as a standing way past the login.
   */
  offlineChosen: boolean;
  set: (patch: Partial<SyncState>) => void;
  /** Take or give back the offline choice, remembering it for next time. */
  chooseOffline: (offline: boolean) => void;
}

forgetStoredOffline();

export const useSync = create<SyncState>()((set) => ({
  status: 'off',
  email: null,
  error: null,
  lastSyncedAt: null,
  pending: 0,
  offlineChosen: false,
  set: (patch) => set(patch),

  chooseOffline: (offline) => {
    forgetStoredOffline();
    set({ offlineChosen: offline });
  },
}));
