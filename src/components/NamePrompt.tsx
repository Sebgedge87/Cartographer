import { useEffect, useRef, useState } from 'react';
import { useUI } from '../state/uiStore';
import { createArea, createBoard, createPage, createProject } from '../state/actions';

const HEADING: Record<string, string> = {
  project: 'New project',
  area: 'New area',
  board: 'New board',
  page: 'New page',
};

const HINT: Record<string, string> = {
  project: 'A world, a game, a supplement. It brings its own block types and calendar.',
  area: 'A category — NPCs, Rules, Locations. It holds boards.',
  board: 'One subject, and one canvas. Pages live here.',
  page: 'One document on this board.',
};

/** Asks for a name before making a project, an area, a board or a page. */
export function NamePrompt() {
  const prompt = useUI((s) => s.prompt);
  const set = useUI((s) => s.set);
  const [name, setName] = useState('');
  /** An area brings a board with it, so the same dialogue asks for that name too. */
  const [board, setBoard] = useState('');
  /** Once the board field has been edited it stops following the area's name. */
  const [boardEdited, setBoardEdited] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Start from the suggestion, selected, so Enter accepts it and typing replaces it.
  useEffect(() => {
    if (!prompt) return;
    setName(prompt.initial);
    setBoard(prompt.initial);
    setBoardEdited(false);
    requestAnimationFrame(() => input.current?.select());
  }, [prompt]);

  if (!prompt) return null;
  const close = () => set({ prompt: null });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim() || prompt.initial;
    close();
    if (prompt.kind === 'project') createProject(title);
    else if (prompt.kind === 'area') createArea(title, board.trim() || title);
    else if (prompt.kind === 'board') createBoard(prompt.areaId, title);
    else if (prompt.boardId) {
      createPage({
        boardId: prompt.boardId,
        title,
        ...(prompt.type ? { type: prompt.type } : {}),
        ...(prompt.at ? { at: prompt.at } : {}),
      });
    }
  };

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form className="prompt" onSubmit={submit} onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="prompt__title">{HEADING[prompt.kind]}</h2>
        <p className="prompt__hint">{HINT[prompt.kind]}</p>
        <input
          ref={input}
          className="field prompt__input"
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            // The board trails the area until you say otherwise: most areas open
            // onto one board of the same subject, and typing the name twice is a
            // chore. Touch the field and it is yours.
            if (!boardEdited) setBoard(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        />

        {prompt.kind === 'area' && (
          <>
            <p className="prompt__hint prompt__hint--second">
              It opens with one board. Name that too — an area with no board has
              nowhere to put a page.
            </p>
            <input
              className="field prompt__input"
              value={board}
              placeholder={name || 'First board'}
              onChange={(e) => {
                setBoard(e.target.value);
                setBoardEdited(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                }
              }}
            />
          </>
        )}
        <div className="prompt__actions">
          <button type="button" className="btn btn--sm" onClick={close}>CANCEL</button>
          <button type="submit" className="btn btn--sm btn--fill">CREATE</button>
        </div>
      </form>
    </div>
  );
}
