import { useRef } from 'react';
import type { Page, PageImage } from '../state/types';
import { LIMITS, assetUrl } from '../lib/assets';
import { useAssets } from '../lib/useAssets';
import { useDoc } from '../state/docStore';
import { attachImages } from '../state/actions';

interface Props {
  page: Page;
  /** Put a reference to this image in the body at the caret. */
  onInsert: (image: PageImage) => void;
}

function prettyBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}

/**
 * The page's images, and which of them is the header. Thumbnails only — the strip is
 * for managing pictures, not looking at them; the body preview is where they are read.
 */
export function ImageStrip({ page, onInsert }: Props) {
  const doc = useDoc();
  const picker = useRef<HTMLInputElement>(null);
  const ids = page.images.map((i) => i.id);
  useAssets(ids, 'thumb');

  const full = page.images.length >= LIMITS.maxPerPage;

  return (
    <div className="images">
      <div className="images__head">
        <span className="label">
          Images <b className="images__count">{page.images.length}/{LIMITS.maxPerPage}</b>
        </span>
        <button
          className="btn btn--sm"
          disabled={full}
          title={full ? `A page holds at most ${LIMITS.maxPerPage} images` : 'Add images'}
          onClick={() => picker.current?.click()}
        >
          ADD
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files) void attachImages(page.id, files);
            // Clear it, or picking the same file twice in a row does nothing.
            e.target.value = '';
          }}
        />
      </div>

      <div className="images__strip">
        {page.images.map((image) => {
          const url = assetUrl(image.id, 'thumb');
          const isHeader = page.header === image.id;
          return (
            <div key={image.id} className={'shot' + (isHeader ? ' shot--header' : '')}>
              <div className="shot__frame">
                {url
                  ? <img src={url} alt={image.name} />
                  : <span className="shot__pending">…</span>}
                {isHeader && <span className="shot__badge">HEADER</span>}
              </div>
              <div className="shot__name truncate" title={`${image.name} · ${image.w}×${image.h} · ${prettyBytes(image.bytes)}`}>
                {image.name}
              </div>
              <div className="shot__acts">
                <button
                  className="shot__act"
                  aria-pressed={isHeader}
                  title={isHeader ? 'This is the header image' : 'Use as the header image'}
                  onClick={() => doc.setHeaderImage(page.id, isHeader ? null : image.id)}
                >
                  {isHeader ? '★' : '☆'}
                </button>
                <button className="shot__act" title="Place in the body" onClick={() => onInsert(image)}>
                  ↵
                </button>
                <button
                  className="shot__act shot__act--danger"
                  title="Remove from this page"
                  onClick={() => doc.removePageImage(page.id, image.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
