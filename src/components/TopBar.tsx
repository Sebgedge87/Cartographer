import { useRef } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

/**
 * The filter and the project name, and nothing else. Settings, views, export and
 * sync all live in the fly-out at the bottom of the rail.
 */
export function TopBar() {
  const projectId = useUI((s) => s.projectId);
  const search = useUI((s) => s.search);
  const renaming = useUI((s) => s.renamingProject);
  const set = useUI((s) => s.set);

  const project = useDoc((s) => s.projects.find((p) => p.id === projectId));
  const renameProject = useDoc((s) => s.renameProject);
  const nameInput = useRef<HTMLInputElement>(null);

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

      {renaming && project ? (
        <input
          ref={nameInput}
          className="field topbar__rename"
          autoFocus
          value={project.name}
          onChange={(e) => renameProject(project.id, e.target.value)}
          onBlur={() => set({ renamingProject: false })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      ) : (
        <h1
          className="topbar__project truncate"
          onDoubleClick={() => set({ renamingProject: true })}
          title="Double-click to rename"
        >
          {project?.name ?? 'Project'}
        </h1>
      )}

      <div className="spacer" />
      {/* Balances the filter on the left so the title stays optically centred. */}
      <div className="topbar__gutter" />
    </div>
  );
}
