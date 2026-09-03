import { useUI } from '../state/uiStore';
import { ProjectSwitcher } from './ProjectSwitcher';

/**
 * The filter and the project switcher, and nothing else. Settings, views, export
 * and sync all live in the fly-out at the bottom of the rail.
 */
export function TopBar() {
  const search = useUI((s) => s.search);
  const set = useUI((s) => s.set);

  return (
    <div className="topbar">
      <div className="search">
        <span className="search__glyph">⌕</span>
        <input
          className="field"
          placeholder="Filter pages"
          value={search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <div className="spacer" />

      <ProjectSwitcher />

      <div className="spacer" />
      {/* Balances the filter on the left so the title stays optically centred. */}
      <div className="topbar__gutter" />
    </div>
  );
}
