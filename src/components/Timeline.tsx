import { useEffect, useMemo, useRef } from 'react';
import type { Field, Page, WorldDate } from '../state/types';
import { blockType, pageFields, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import {
  daysBetween, describeSpan, formatDate, parseDate, toDayNumber, weekdayName,
} from '../lib/calendar';

/**
 * One dated thing. A page can hold several date fields — a location founded in one
 * year and sacked in another — and each is its own point in time, so the entry is
 * the pairing of a page with one of its dates rather than the page itself.
 */
interface Entry {
  page: Page;
  field: Field;
  date: WorldDate;
  day: number;
}

/**
 * Every dated field in the project, in order. The calendar decides what order means:
 * comparing years, then months, then days would go wrong the moment a month changes
 * length, so everything sorts by absolute day number.
 */
export function Timeline() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const search = useUI((s) => s.search);
  const openPage = useUI((s) => s.openPage);
  const set = useUI((s) => s.set);
  const todayRow = useRef<HTMLDivElement>(null);

  const schema = schemaFor(doc, projectId);
  const calendar = schema.calendar;

  const entries = useMemo((): Entry[] => {
    const query = search.trim().toLowerCase();
    const out: Entry[] = [];
    for (const page of doc.pages) {
      if (page.projectId !== projectId) continue;
      if (query && !page.title.toLowerCase().includes(query)) continue;
      for (const field of pageFields(doc, page)) {
        if (field.kind !== 'date') continue;
        const date = parseDate(page.fields[field.key] ?? '');
        if (!date) continue;
        out.push({ page, field, date, day: toDayNumber(calendar, date) });
      }
    }
    return out.sort((a, b) => a.day - b.day || a.page.title.localeCompare(b.page.title));
  }, [doc, projectId, search, calendar]);

  const undated = useMemo(
    () => doc.pages.filter((p) => p.projectId === projectId).length,
    [doc.pages, projectId],
  ) - new Set(entries.map((e) => e.page.id)).size;

  const todayDay = toDayNumber(calendar, calendar.today);

  // Land on the present rather than at the dawn of history.
  useEffect(() => {
    todayRow.current?.scrollIntoView({ block: 'center' });
  }, [projectId]);

  if (!projectId) return null;

  if (entries.length === 0) {
    return (
      <div className="timeline">
        <div className="timeline__empty">
          <b>NOTHING DATED YET</b>
          <span>
            Give a page a <b>date</b> element — in the page editor, under Fields — and it appears
            here. A page can carry several: founded, fell, last seen.
          </span>
          <button className="btn btn--sm" onClick={() => set({ mode: 'schema' })}>
            OPEN THE CALENDAR
          </button>
        </div>
      </div>
    );
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  // Where the present belongs in the sequence, so the marker can be spliced in.
  const todayAt = entries.findIndex((e) => e.day > todayDay);
  const todayIndex = todayAt === -1 ? entries.length : todayAt;

  let lastYear: number | null = null;

  const marker = (
    <div className="tl-today" ref={todayRow} key="today">
      <span className="tl-today__dot" />
      <span className="tl-today__label">
        {formatDate(calendar, calendar.today)} · today
      </span>
    </div>
  );

  return (
    <div className="timeline">
      <div className="timeline__head">
        <span className="label">Timeline</span>
        <span className="schema__note">
          {entries.length} dated {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
          {formatDate(calendar, first.date)} to {formatDate(calendar, last.date)}
          {undated > 0 && ` · ${undated} undated ${undated === 1 ? 'page' : 'pages'}`}
        </span>
        <span className="spacer" />
        <button
          className="btn btn--sm"
          title="Scroll to the present"
          onClick={() => todayRow.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        >
          TODAY
        </button>
      </div>

      <div className="timeline__scroll">
        <div className="timeline__spine">
          {entries.map((entry, i) => {
            const rows = [];
            if (i === todayIndex) rows.push(marker);

            if (entry.date.year !== lastYear) {
              lastYear = entry.date.year;
              rows.push(
                <div className="tl-year" key={`y${entry.date.year}-${i}`}>
                  {entry.date.year}
                  {calendar.era && <span className="tl-year__era">{calendar.era}</span>}
                </div>,
              );
            }

            const type = blockType(schema, entry.page.type);
            const month = calendar.months[entry.date.month - 1]?.name ?? '';
            const away = daysBetween(calendar, calendar.today, entry.date);
            const inArea = !areaId || doc.boards.find((b) => b.id === entry.page.boardId)?.areaId === areaId;

            rows.push(
              <button
                key={`${entry.page.id}:${entry.field.key}`}
                className={'tl-entry' + (inArea ? '' : ' tl-entry--other-area')}
                style={{ ['--tint' as string]: type.color }}
                onClick={() => openPage(entry.page.id, entry.page.boardId)}
              >
                <span className="tl-entry__when">
                  <b>{entry.date.day} {month}</b>
                  <span className="tl-entry__weekday">{weekdayName(calendar, entry.date)}</span>
                </span>
                <span className="tl-entry__dot" />
                <span className="chip" style={{ ['--chip' as string]: type.color }}>{type.code}</span>
                <span className="tl-entry__title truncate">{entry.page.title}</span>
                <span className="tl-entry__field">{entry.field.label}</span>
                <span className="tl-entry__away">
                  {/* A holiday has no distance from now — it is every year. Showing
                      "336 years ago" for one would be measuring the wrong thing. */}
                  {entry.date.repeats ? '↻ every year' : describeSpan(calendar, away)}
                </span>
              </button>,
            );
            return rows;
          })}
          {todayIndex === entries.length && marker}
        </div>
      </div>
    </div>
  );
}
