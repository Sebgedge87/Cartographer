import { useSync } from '../state/syncStore';
import { signOut } from '../state/sync/auth';
import { saveNow, syncNow } from '../state/sync/engine';

const LABEL: Record<string, string> = {
  off: 'LOCAL',
  'signed-out': 'LOCAL',
  connecting: 'CONNECTING',
  syncing: 'SAVING',
  synced: 'SAVED',
  error: 'SYNC ERROR',
};

/** Status chip in the top bar. Click it to save, force a round trip, or sign out. */
export function SyncBadge() {
  const status = useSync((s) => s.status);
  const email = useSync((s) => s.email);
  const error = useSync((s) => s.error);
  const pending = useSync((s) => s.pending);

  // Unsaved work is the thing worth shouting about, so it wins the label.
  const unsaved = pending > 0 && status !== 'connecting' && status !== 'syncing';
  const label = unsaved ? `SAVE ${pending}` : LABEL[status] ?? 'LOCAL';

  const held = `${pending} unsaved change${pending === 1 ? '' : 's'}, held on this device`;
  const title =
    unsaved && status === 'error' ? `${held}. The last save failed: ${error ?? 'unknown error'}. Click to try again.`
      : unsaved ? `${held} — click to save now (autosaves every 5 minutes)`
      : status === 'error' ? `Sync failed: ${error ?? 'unknown error'}`
      : status === 'off' ? 'No sync configured — projects stay in this browser'
      : status === 'signed-out' ? 'Not signed in — click to sign in and sync'
      : email ?? '';

  return (
    <button
      className={`sync sync--${status}${unsaved ? ' sync--unsaved' : ''}`}
      title={title}
      onClick={() => {
        if (status === 'signed-out') { useSync.getState().chooseOffline(false); return; }
        if (unsaved) { void saveNow(); return; }
        if (status === 'synced' || status === 'error') void syncNow();
      }}
      onDoubleClick={() => { if (email) void signOut(); }}
    >
      <span className="sync__dot" />
      {label}
    </button>
  );
}
