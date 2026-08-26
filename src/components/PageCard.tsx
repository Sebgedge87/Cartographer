import { memo } from 'react';
import type { BlockType, Field, Page } from '../state/types';
import { plainSnippet } from '../lib/markdown';

interface Props {
  page: Page;
  type: BlockType;
  fields: Field[];
  selected: boolean;
  outCount: number;
  inCount: number;
  /** Links whose other endpoint sits in a different area, so no edge is drawn for them. */
  offBoard: number;
  onEdit: () => void;
}

/** Scalar fields only — refs and prose never earn a slot on a 244×116 card. */
function statChips(page: Page, fields: Field[]) {
  return fields
    .filter((f) => f.kind !== 'ref' && f.kind !== 'long' && f.kind !== 'heading')
    .map((f) => ({ label: f.label, value: page.fields[f.key] }))
    .filter((c): c is { label: string; value: string } => c.value !== undefined && c.value !== '')
    .slice(0, 4)
    .map((c) => ({ label: c.label, value: c.value.slice(0, 18) }));
}

export const PageCard = memo(function PageCard({
  page, type, fields, selected, outCount, inCount, offBoard, onEdit,
}: Props) {
  const chips = statChips(page, fields);
  const snippet = chips.length === 0 ? plainSnippet(page.body) : '';

  return (
    <div
      data-pid={page.id}
      className={'card' + (selected ? ' card--selected' : '')}
      style={{
        left: page.x, top: page.y, width: page.w, height: page.h,
        ['--tint' as string]: type.color,
      }}
    >
      <div className="card__head">
        <span className="chip" style={{ ['--chip' as string]: type.color }}>{type.code}</span>
        <span className="card__title truncate">{page.title}</span>
      </div>

      <div className="card__body">
        {chips.map((c) => (
          <span key={c.label} className="card__stat">
            <span>{c.label}</span>
            <b>{c.value}</b>
          </span>
        ))}
        {snippet && <span className="card__snippet">{snippet}</span>}
      </div>

      <div className="card__foot">
        <span>{outCount}↗</span>
        <span>{inCount}↘</span>
        {offBoard > 0 && <span className="card__off">{offBoard} OFF-BOARD</span>}
        <button
          className="card__edit"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          EDIT
        </button>
      </div>

      <button className="card__port" data-port={page.id} title="Drag to link" />
    </div>
  );
});
