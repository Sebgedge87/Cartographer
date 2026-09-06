import { useEffect, type RefObject } from 'react';

/**
 * Close a popover on Escape or on a click outside it.
 *
 * The Escape listener runs in the capture phase and stops propagation, so the
 * global handler does not also act on the same keypress — otherwise dismissing a
 * fly-out would close the editor behind it at the same time.
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    // Capture, for the same reason as the keydown above: a click inside something
    // that stops pointerdown propagating — the page editor does, so its scrim does
    // not close behind it — would otherwise never reach a bubble-phase listener,
    // and the popover would stay open until you picked something off it.
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, ref, close]);
}
