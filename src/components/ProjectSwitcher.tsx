import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { openProject } from '../state/actions';

/**
 * The project name is the way out. Clicking it lists every project, so moving
 * between two of them is one step rather than a trip through the home screen —
 * which is what a back arrow would have made you do.
 */
export function ProjectSwitcher() {
  const [open, setOpen] = useState(false);
  const projectId = useUI((s) => s.projectId);
  const renaming = useUI((s) => s.renamingProject);
  const set = useUI((s) => s.set);
  const goHome = useUI((s) => s.goHome);

  const doc = useDoc();
  const project = doc.projects.find((p) => p.id === projectId);
  const renameProject = doc.renameProject;

  const wrap = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrap, close);


  if (renaming && project) {
    return (
      <input
        className="field topbar__rename"
        autoFocus
        value={project.name}
        onChange={(e) => renameProject(project.id, e.target.value)}
        onBlur={() => set({ renamingProject: false })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    );
  }

  return (
    <div className="switcher" ref={wrap}>
      <button
        className={'switcher__button' + (open ? ' switcher__button--open' : '')}
        aria-expanded={open}
        title="Switch project"
        onClick={() => setOpen(!open)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (project) {
            set({ context: { x: e.clientX, y: e.clientY, target: { kind: 'project', id: project.id } } });
          }
        }}
      >
        <span className="truncate">{project?.name ?? 'Project'}</span>
        <span className="switcher__caret">▾</span>
      </button>

      {open && (
        <div className="switcher__panel">
          <button
            className="switcher__item switcher__item--home"
            onClick={() => { setOpen(false); goHome(); }}
          >
            All projects
          </button>

          {doc.projects.length > 1 && <div className="switcher__rule" />}

          {doc.projects
            .filter((p) => p.id !== projectId)
            .map((p) => {
              const boards = doc.boards.filter((b) => b.projectId === p.id).length;
              const pages = doc.pages.filter((q) => q.projectId === p.id).length;
              return (
                <button
                  key={p.id}
                  className="switcher__item"
                  onClick={() => { setOpen(false); openProject(p.id); }}
                >
                  <span className="switcher__dot" style={{ background: p.accent }} />
                  <span className="truncate">{p.name}</span>
                  <span className="switcher__meta">{boards} / {pages}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
