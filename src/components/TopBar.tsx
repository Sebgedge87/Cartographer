import { ProjectSwitcher } from './ProjectSwitcher';
import { SyncBadge } from './SyncBadge';
import { useSync } from '../state/syncStore';

/**
 * The project switcher, left-aligned, and — once this build has a Supabase to talk
 * to — the save chip on the right. Unsaved work has to be visible without opening a
 * panel, which is why that one control lives out here rather than in the fly-out at
 * the rail's foot with search, views, export and the rest of sync.
 */
export function TopBar() {
  const status = useSync((s) => s.status);

  return (
    <div className="topbar">
      <ProjectSwitcher />
      <div className="spacer" />
      {status !== 'off' && <SyncBadge />}
    </div>
  );
}
