import { useMemo, useRef } from 'react';
import { useDoc } from '../state/docStore';
import { createProject, importProjectFile, openProject } from '../state/actions';

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
            <button className="btn btn--fill" onClick={createProject}>+ NEW PROJECT</button>
          </div>
        </header>

        <div className="tiles">
          {tiles.map(({ project, areas: projectAreas, pageCount, areaCount, linkCount }) => (
            <button
              key={project.id}
              className="tile"
              onClick={() => openProject(project.id)}
              style={{ ['--tint' as string]: project.accent }}
            >
              <span className="tile__grid" />
              <div className="tile__head">
                <div style={{ minWidth: 0 }}>
                  <div className="tile__name truncate">{project.name}</div>
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
            </button>
          ))}
          <button className="tile tile--new" onClick={createProject}>+ BLANK PROJECT</button>
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
