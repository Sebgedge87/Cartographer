import { useEffect, useRef, useState } from 'react';
import { useUI } from '../state/uiStore';
import { createArea, createBoard, createPage } from '../state/actions';

const HEADING: Record<string, string> = {
  area: 'New area',
  board: 'New board',
  page: 'New page',
};

const HINT: Record<string, string> = {
  area: 'A category — NPCs, Rules, Locations. It holds boards.',
  board: 'One subject, and one canvas. Pages live here.',
  page: 'One document on this board.',
};

/** Asks for a name before making an area, a board or a page. */
export function NamePrompt() {
  const prompt = useUI((s) => s.prompt);
  const set = useUI((s) => s.set);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Start from the suggestion, selected, so Enter accepts it and typing replaces it.
  useEffect(() => {
    if (!prompt) return;
    setName(prompt.initial);
    requestAnimationFrame(() => input.current?.select());
  }, [prompt]);

  if (!prompt) return null;
  const close = () => set({ prompt: null });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim() || prompt.initial;
    close();
    if (prompt.kind === 'area') createArea(title);
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
          onChange={(e) => setName(e.target.value)}
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
          <button type="submit" className="btn btn--sm btn--fill">CREATE</button>
        </div>
      </form>
    </div>
  );
}
