import { useCallback, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import type { WordSpan } from '../lib/words';

interface Props {
  text: string;
  spans: WordSpan[];
  /** The textarea being underlined. Its wrapping, scroll and width are copied. */
  textarea: RefObject<HTMLTextAreaElement>;
  /** The layer that scrolls with it; the caller keeps it to hit-test right-clicks. */
  inner: RefObject<HTMLDivElement>;
}

/**
 * The squiggles, drawn behind the textarea.
 *
 * A textarea will not let anything be styled inside it, so the only way to mark a
 * word is to lay the same text out again underneath in transparent ink and
 * underline it there. The two agree because they are given identical typography by
 * a shared CSS rule — copying computed styles in JavaScript drifts the moment a
 * theme changes one of them.
 */
export function SpellUnderlay({ text, spans, textarea, inner }: Props) {
  /**
   * Match the width the text actually wraps at, which is the textarea's content
   * box: once it scrolls, that is narrower than the layer by a scrollbar. And
   * follow its scroll, since only one of the two elements can really scroll.
   */
  const fit = useCallback(() => {
    const el = textarea.current;
    const layer = inner.current;
    if (!el || !layer) return;
    layer.style.width = `${el.clientWidth}px`;
    layer.style.transform = `translateY(${-el.scrollTop}px)`;
  }, [textarea, inner]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // The textarea scrolls itself when the caret runs off the bottom, so listening
    // covers both a drag of the scrollbar and a line typed into view.
    el.addEventListener('scroll', fit, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', fit);
    };
  }, [fit, textarea]);

  // Again after every render: the layer's own content has just changed, and on the
  // very first one the textarea's ref may not have been attached yet.
  useLayoutEffect(fit);

  const parts: (string | JSX.Element)[] = [];
  let at = 0;
  for (const span of spans) {
    // A span measured before the last keystroke can point at moved text. Rather
    // than hold the whole layer back a frame, drop the ones that no longer match;
    // the next check puts them back where they belong.
    if (span.start < at || text.slice(span.start, span.end) !== span.word) continue;
    if (span.start > at) parts.push(text.slice(at, span.start));
    parts.push(
      <mark key={span.start} data-start={span.start} data-end={span.end}>{span.word}</mark>,
    );
    at = span.end;
  }
  // The trailing newline is the usual mirror trick: without it a body ending in a
  // line break is one line shorter here than in the textarea.
  parts.push(`${text.slice(at)}\n`);

  return (
    <div className="editor__spell" aria-hidden>
      <div className="editor__spell-ink" ref={inner}>{parts}</div>
    </div>
  );
}
