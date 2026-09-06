import { useEffect, useRef, useState } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { deleteProject } from '../state/actions';

/**
 * Deleting a project takes everything in it and cannot be undone from the home
 * screen, so it asks for the name to be typed out. That is deliberately more
 * friction than a Yes/No: a confirmation you can dismiss without reading is one
 * you will dismiss without reading, and this is the only destructive action in
 * the app whose blast radius is a whole world.
 */
export function DeleteProject() {
  const id = useUI((s) => s.deletingProject);
  const set = useUI((s) => s.set);
  const doc = useDoc();
  const project = doc.projects.find((p) => p.id === id);
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Empty on each opening: a name left over from last time would be a Delete
  // button that is already armed.
  useEffect(() => {
    setTyped('');
    if (id) requestAnimationFrame(() => input.current?.focus());
  }, [id]);

  if (!id || !project) return null;

  const areas = doc.areas.filter((a) => a.projectId === id).length;
  const boards = doc.boards.filter((b) => b.projectId === id).length;
  const pages = doc.pages.filter((p) => p.projectId === id).length;
  const matches = typed.trim() === project.name.trim();
  const close = () => set({ deletingProject: null });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matches) deleteProject(id);
  };

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="prompt" onSubmit={submit} onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="prompt__title">Delete project</h2>
        <p className="prompt__hint">
          This deletes <b>{project.name}</b> and everything in it —{' '}
          {count(areas, 'area', 'areas')}, {count(boards, 'board', 'boards')} and{' '}
          {count(pages, 'page', 'pages')}. Export it first if you may want it back.
        </p>
        <p className="prompt__hint">
          Type <b>{project.name}</b> to confirm.
        </p>
        <input
          ref={input}
          className="field prompt__input"
          value={typed}
          placeholder={project.name}
          // The browser's own dictionary has no opinion worth having about a
          // project name, and a red squiggle here reads as an error in the field.
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        />
        <div className="prompt__actions">
          <button type="button" className="btn btn--sm" onClick={close}>CANCEL</button>
          <button
            type="submit"
            className="btn btn--sm btn--danger"
            disabled={!matches}
            title={matches ? undefined : 'Type the project name to confirm'}
          >
            DELETE
          </button>
        </div>
      </form>
    </div>
  );
}
