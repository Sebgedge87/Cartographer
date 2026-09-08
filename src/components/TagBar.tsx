import { useState } from 'react';
import { X } from 'lucide-react';
import type { Page } from '../state/types';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

/**
 * A page's tags, and the box for adding one.
 *
 * Clicking a tag searches for it, which is the whole point of having them: a page
 * lives on exactly one board, so tags are the only way to ask "everything to do
 * with the guilds" across a project filed by region.
 */
export function TagBar({ page }: { page: Page }) {
  const setTags = useDoc((s) => s.setTags);
  const set = useUI((s) => s.set);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const wanted = draft.split(',').map((t) => t.trim()).filter(Boolean);
    setDraft('');
    if (wanted.length) setTags(page.id, [...page.tags, ...wanted]);
  };

  return (
    <div className="tags">
      {page.tags.map((tag) => (
        <span key={tag} className="tag">
          <button
            className="tag__name"
            title={`Find everything tagged “${tag}”`}
            onClick={() => set({ search: `#${tag}` })}
          >
            {tag}
          </button>
          <button
            className="tag__drop"
            title="Remove tag"
            onClick={() => setTags(page.id, page.tags.filter((t) => t !== tag))}
          >
            <X size={11} strokeWidth={2.75} aria-hidden />
          </button>
        </span>
      ))}
      <input
        className="tags__input"
        placeholder={page.tags.length ? '+ tag' : '+ tag, comma separated'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          // Backspace on an empty box takes the last tag off, the way tag boxes do.
          else if (e.key === 'Backspace' && !draft && page.tags.length) {
            setTags(page.id, page.tags.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
