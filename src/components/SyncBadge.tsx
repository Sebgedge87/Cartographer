import { useSync } from '../state/syncStore';
import { signOut } from '../state/sync/auth';
import { syncNow } from '../state/sync/engine';

const LABEL: Record<string, string> = {
  off: 'LOCAL',
  'signed-out': 'LOCAL',
  connecting: 'CONNECTING',
  syncing: 'SYNCING',
  synced: 'SYNCED',
  error: 'SYNC ERROR',
};

/** Status chip in the top bar. Click it to force a round trip or sign out. */
export function SyncBadge() {
  const status = useSync((s) => s.status);
  const email = useSync((s) => s.email);
  const error = useSync((s) => s.error);

  const title =
    status === 'error' ? `Sync failed: ${error ?? 'unknown error'}`
      : status === 'off' ? 'No sync configured — projects stay in this browser'
      : status === 'signed-out' ? 'Not signed in — click to sign in and sync'
      : email ?? '';

  return (
    <button
      className={`sync sync--${status}`}
      title={title}
      onClick={() => {
        if (status === 'signed-out') { useSync.getState().set({ offlineChosen: false }); return; }
        if (status === 'synced' || status === 'error') void syncNow();
      }}
      onDoubleClick={() => { if (email) void signOut(); }}
    >
      <span className="sync__dot" />
      {LABEL[status] ?? 'LOCAL'}
    </button>
  );
}
