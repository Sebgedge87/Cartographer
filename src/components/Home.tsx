import { useMemo, useRef } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { importProjectFile, openProject, promptNew } from '../state/actions';

/** A project is named before it exists, like everything else in the app. */
const newProject = () => promptNew({ kind: 'project', initial: 'New project' });

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Home() {
  const projects = useDoc((s) => s.projects);
  const renameProject = useDoc((s) => s.renameProject);
  const renaming = useUI((s) => s.renamingProject);
  const set = useUI((s) => s.set);
  const areas = useDoc((s) => s.areas);
  const pages = useDoc((s) => s.pages);
  const edges = useDoc((s) => s.edges);
  const fileInput = useRef<HTMLInputElement>(null);

  const tiles = useMemo(
    () =>
      projects.map((project) => {
        const projectAreas = areas.filter((a) => a.projectId === project.id);
        const projectPages = pages.filter((p) => p.projectId === project.id);
        const ids = new Set(projectPages.map((p) => p.id));
        return {
          project,
          areas: projectAreas,
          pageCount: projectPages.length,
          areaCount: projectAreas.length,
          linkCount: edges.filter((e) => ids.has(e.from) && ids.has(e.to)).length,
        };
      }),
    [projects, areas, pages, edges],
  );

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__head">
          <div>
            <div className="home__kicker">DRAFTING ENVIRONMENT</div>
            <h1 className="home__title">Cartographer</h1>
            <p className="home__desc">
              A drafting board for tabletop and board-game design. Every block type, field label
              and area name belongs to the project it lives in.
            </p>
          </div>
          <div className="spacer" />
          <div className="home__actions">
            <button className="btn" onClick={() => fileInput.current?.click()}>IMPORT JSON</button>
            <button className="btn btn--fill" onClick={newProject}>+ NEW PROJECT</button>
          </div>
        </header>

        <div className="tiles">
          {tiles.map(({ project, areas: projectAreas, pageCount, areaCount, linkCount }) => (
            <div
              key={project.id}
              className="tile"
              role="button"
              tabIndex={0}
              // A div rather than a button because the name becomes a text field in
              // place, and an input inside a button is neither valid nor clickable.
              onClick={() => renaming !== project.id && openProject(project.id)}
              onKeyDown={(e) => {
                if (renaming === project.id) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openProject(project.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                set({ context: { x: e.clientX, y: e.clientY, target: { kind: 'project', id: project.id } } });
              }}
              style={{ ['--tint' as string]: project.accent }}
            >
              <span className="tile__grid" />
              <div className="tile__head">
                <div style={{ minWidth: 0 }}>
                  {renaming === project.id ? (
                    <input
                      className="field tile__rename"
                      autoFocus
                      value={project.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameProject(project.id, e.target.value)}
                      onBlur={() => set({ renamingProject: null })}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <div className="tile__name truncate">{project.name}</div>
                  )}
                  <div className="tile__system truncate">{project.system}</div>
                </div>
                <div className="spacer" />
                <div className="tile__badge">{initials(project.name)}</div>
              </div>
              <div className="tile__areas">
                {projectAreas.slice(0, 5).map((a) => (
                  <span key={a.id} className="tile__area">{a.name}</span>
                ))}
              </div>
              <div className="tile__stats">
                <span>{pageCount} PAGES</span>
                <span>{linkCount} LINKS</span>
                <span>{areaCount} AREAS</span>
              </div>
            </div>
          ))}
          <button className="tile tile--new" onClick={newProject}>+ BLANK PROJECT</button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importProjectFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
