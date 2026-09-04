import { useEffect, useState } from 'react';
import { loadAssets } from './assets';

/**
 * Pull these assets into the URL cache and re-render once they arrive.
 *
 * Markdown and <img> both read the cache synchronously — rendering cannot await a
 * blob — so something has to fetch first and then tell React the URLs exist. The
 * returned counter is that signal; use it as a memo dependency.
 */
export function useAssets(ids: string[], variant: 'full' | 'thumb' = 'full'): number {
  const [version, setVersion] = useState(0);
  // Joined so the effect keys on the contents rather than a fresh array each render.
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    void loadAssets(key ? key.split(',') : [], variant).then((added) => {
      if (added && live) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [key, variant]);
  return version;
}
