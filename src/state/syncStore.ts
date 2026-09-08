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
 * "Work offline on this device" is a decision about this browser, so it is kept in
 * this browser. In memory it lasted until the next reload, which made a choice the
 * button describes as lasting look like it had been ignored.
 */
const OFFLINE_KEY = 'cartographer.offline';

function storedOffline(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === 'yes';
  } catch {
    return false;
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
  /** The user chose to work on this device without signing in. */
  offlineChosen: boolean;
  set: (patch: Partial<SyncState>) => void;
  /** Take or give back the offline choice, remembering it for next time. */
  chooseOffline: (offline: boolean) => void;
}

export const useSync = create<SyncState>()((set) => ({
  status: 'off',
  email: null,
  error: null,
  lastSyncedAt: null,
  pending: 0,
  offlineChosen: storedOffline(),
  set: (patch) => set(patch),

  chooseOffline: (offline) => {
    try {
      if (offline) localStorage.setItem(OFFLINE_KEY, 'yes');
      else localStorage.removeItem(OFFLINE_KEY);
    } catch {
      /* private mode; the choice just will not survive a reload */
    }
    set({ offlineChosen: offline });
  },
}));
