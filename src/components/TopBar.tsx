import { useRef } from 'react';
import type { ViewMode } from '../state/types';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { exportCurrentProject } from '../state/actions';

const MODES: { key: ViewMode; label: string }[] = [
  { key: 'board', label: 'BOARD' },
  { key: 'table', label: 'PAGES' },
  { key: 'schema', label: 'SCHEMA' },
];

export function TopBar() {
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const mode = useUI((s) => s.mode);
  const search = useUI((s) => s.search);
  const renaming = useUI((s) => s.renamingProject);
  const set = useUI((s) => s.set);
  const goHome = useUI((s) => s.goHome);

  const project = useDoc((s) => s.projects.find((p) => p.id === projectId));
  const area = useDoc((s) => s.areas.find((a) => a.id === areaId));
  const renameProject = useDoc((s) => s.renameProject);
  const nameInput = useRef<HTMLInputElement>(null);

  return (
    <div className="topbar">
      <button className="topbar__back" onClick={goHome} title="Back to projects">‹</button>

      <div className="topbar__crumb">
        {renaming && project ? (
          <input
            ref={nameInput}
            className="field"
            style={{ width: 200 }}
            autoFocus
            value={project.name}
            onChange={(e) => renameProject(project.id, e.target.value)}
            onBlur={() => set({ renamingProject: false })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        ) : (
          <span
            className="topbar__project truncate"
            onDoubleClick={() => set({ renamingProject: true })}
            title="Double-click to rename"
          >
            {project?.name ?? 'Project'}
          </span>
        )}
        <span className="topbar__area truncate">/ {area?.name ?? '—'}</span>
      </div>

      <div className="spacer" />

      <div className="segments">
        {MODES.map((m) => (
          <button
            key={m.key}
            className="segment"
            aria-pressed={mode === m.key}
            onClick={() => set({ mode: m.key })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <div className="search">
        <span className="search__glyph">⌕</span>
        <input
          className="field"
          placeholder="Filter pages"
          value={search}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>
      <button className="btn btn--sm" onClick={() => set({ cmd: { q: '', i: 0 } })}>⌘K</button>
      <button className="btn btn--sm" onClick={exportCurrentProject}>EXPORT</button>
    </div>
  );
}
