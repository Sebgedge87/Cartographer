import type { Doc, ProjectFile } from '../state/types';

export const FORMAT = 'cartographer/v1';

/** Everything one project needs to travel on its own: pages, links and its schema. */
export function buildProjectFile(doc: Doc, projectId: string): ProjectFile | null {
  const project = doc.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const pages = doc.pages.filter((p) => p.projectId === projectId);
  const ids = new Set(pages.map((p) => p.id));
  const schema = doc.schemas[projectId];
  return {
    format: FORMAT,
    project,
    areas: doc.areas.filter((a) => a.projectId === projectId),
    pages,
    types: schema?.types ?? {},
    typeOrder: schema?.typeOrder ?? [],
    links: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}

export function slug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase() || 'project';
}

export function downloadProject(file: ProjectFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(file.project.name)}.cartographer.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse an imported file, rejecting anything that is not a project export. */
export function parseProjectFile(raw: string): ProjectFile | null {
  try {
    const data = JSON.parse(raw) as Partial<ProjectFile>;
    if (!data || !Array.isArray(data.pages)) return null;
    return {
      format: FORMAT,
      project: data.project ?? { id: '', name: 'Imported', system: 'Imported', accent: '#8fa5c9' },
      areas: data.areas ?? [],
      pages: data.pages,
      types: data.types ?? {},
      typeOrder: data.typeOrder ?? [],
      links: data.links ?? [],
    };
  } catch {
    return null;
  }
}
