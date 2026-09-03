import { ProjectSwitcher } from './ProjectSwitcher';

/**
 * Just the project switcher, left-aligned. Search sits in the rail with the tree it
 * filters; settings, views, export and sync are in the fly-out at the rail's foot.
 */
export function TopBar() {
  return (
    <div className="topbar">
      <ProjectSwitcher />
      <div className="spacer" />
    </div>
  );
}
