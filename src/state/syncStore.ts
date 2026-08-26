import { create } from 'zustand';

export type SyncStatus =
  /** No credentials configured — local-only, and that is a supported mode. */
  | 'off'
  | 'signed-out'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'error';

interface SyncState {
  status: SyncStatus;
  email: string | null;
  error: string | null;
  /** When the last successful push or pull completed. */
  lastSyncedAt: number | null;
  /** The user chose to work on this device without signing in. */
  offlineChosen: boolean;
  set: (patch: Partial<SyncState>) => void;
}

export const useSync = create<SyncState>()((set) => ({
  status: 'off',
  email: null,
  error: null,
  lastSyncedAt: null,
  offlineChosen: false,
  set: (patch) => set(patch),
}));
