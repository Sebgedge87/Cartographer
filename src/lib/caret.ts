/**
 * Where the caret sits, in pixels. A textarea will not tell you, so we measure a
 * hidden div that copies its typography and wraps text the same way, then read the
 * offset of a marker span placed at the caret.
 */

/** Everything that changes where a glyph lands. Kebab-case for `setProperty`. */
const COPIED = [
  'width',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'line-height', 'text-transform', 'text-indent',
  'word-spacing', 'tab-size',
];

export interface CaretPoint {
  /** Relative to the textarea's border box, its own scroll already applied. */
  left: number;
  top: number;
  /** One line's height, so a caller can clear the line the caret is on. */
  line: number;
}

export function caretPoint(el: HTMLTextAreaElement, index: number): CaretPoint {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const prop of COPIED) mirror.style.setProperty(prop, style.getPropertyValue(prop));
  // Computed `width` is the content box, so the mirror must measure the same way.
  mirror.style.boxSizing = 'content-box';
  mirror.style.position = 'absolute';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';

  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement('span');
  // The rest of the text makes the marker wrap where the real one does; a
  // zero-width space keeps it from collapsing when the caret is at the very end.
  marker.textContent = el.value.slice(index) || '​';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const left = marker.offsetLeft;
  const top = marker.offsetTop;
  mirror.remove();

  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  return { left: left - el.scrollLeft, top: top - el.scrollTop, line };
}
