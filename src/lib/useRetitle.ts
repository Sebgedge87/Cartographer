import { useRef } from 'react';
import { useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';

/**
 * Title-field behaviour shared by the inspector and the page editor.
 *
 * Typing patches the title live, as it always has. Leaving the field is what
 * commits the rename, and that is when every `[[Old Name]]` elsewhere in the
 * project is pointed at the new one. Spreading these props keeps the two title
 * inputs from drifting apart.
 */
export function useRetitle(pageId: string) {
  const retitlePage = useDoc((s) => s.retitlePage);
  const showToast = useUI((s) => s.showToast);
  // The title as it was when the field was entered — the name other pages still use.
  const entered = useRef<string | null>(null);

  const commit = () => {
    const was = entered.current;
    entered.current = null;
    if (was === null) return;
    const { refs, pages, skipped } = retitlePage(pageId, was);
    if (refs) {
      const where = pages === 1 ? '1 page' : `${pages} pages`;
      showToast(`Renamed — ${refs === 1 ? '1 link' : `${refs} links`} updated on ${where}`);
    }
    if (skipped) {
      showToast(`${skipped} @-reference${skipped === 1 ? '' : 's'} could not follow that title`);
    }
  };

  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { entered.current = e.target.value; },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    },
  };
}
