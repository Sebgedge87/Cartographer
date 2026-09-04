import { useMemo, useState } from 'react';
import type { Field, Page, WorldDate } from '../state/types';
import { blockType, pageFields, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import {
  daysInMonth, formatDate, moonPhase, occursOn, parseDate, weekdayIndex,
} from '../lib/calendar';
import { CalendarEditor } from './CalendarEditor';

interface Marked {
  page: Page;
  field: Field;
  date: WorldDate;
}

/**
 * A month of the world's own calendar, with what falls on each day.
 *
 * Two kinds of thing land here. A date marked as repeating comes round every year,
 * which is what a holiday or an anniversary is; a plain date shows only in its own
 * year. So the grid answers both "what recurs" and "what happened that month".
 */
export function CalendarView() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const openPage = useUI((s) => s.openPage);
  const schema = schemaFor(doc, projectId);
  const calendar = schema.calendar;

  const [at, setAt] = useState<{ year: number; month: number }>({
    year: calendar.today.year,
    month: calendar.today.month,
  });
  const [defining, setDefining] = useState(false);

  /** Every dated field in the project, parsed once. */
  const marked = useMemo((): Marked[] => {
    const out: Marked[] = [];
    for (const page of doc.pages) {
      if (page.projectId !== projectId) continue;
      for (const field of pageFields(doc, page)) {
        if (field.kind !== 'date') continue;
        const date = parseDate(page.fields[field.key] ?? '');
        if (date) out.push({ page, field, date });
      }
    }
    return out;
  }, [doc, projectId]);

  if (!projectId) return null;

  const monthName = calendar.months[at.month - 1]?.name ?? '';
  const length = daysInMonth(calendar, at.year, at.month);
  const week = Math.max(1, calendar.weekdays.length);
  // Which column the first of the month falls in, so the grid lines up.
  const offset = weekdayIndex(calendar, { year: at.year, month: at.month, day: 1 });

  const step = (by: number) => {
    let { year, month } = at;
    month += by;
    while (month < 1) { month += calendar.months.length; year--; }
    while (month > calendar.months.length) { month -= calendar.months.length; year++; }
    setAt({ year: Math.max(1, year), month });
  };

  const today = calendar.today;
  const isToday = (day: number) =>
    today.year === at.year && today.month === at.month && today.day === day;

  return (
    <div className="calview">
      <div className="calview__head">
        <button className="icon-btn" title="Previous month" onClick={() => step(-1)}>‹</button>
        <span className="calview__title">
          {monthName} <b>{at.year}</b>
          {calendar.era && <span className="calview__era">{calendar.era}</span>}
        </span>
        <button className="icon-btn" title="Next month" onClick={() => step(1)}>›</button>
        <button
          className="btn btn--sm"
          onClick={() => setAt({ year: today.year, month: today.month })}
        >
          TODAY
        </button>
        <span className="spacer" />
        <button
          className={'btn btn--sm' + (defining ? ' btn--on' : '')}
          title="Months, week, leap rule and moons"
          onClick={() => setDefining(!defining)}
        >
          DEFINE
        </button>
      </div>

      {defining ? (
        <div className="calview__define">
          <CalendarEditor projectId={projectId} calendar={calendar} />
        </div>
      ) : (
        <div className="calview__scroll">
          <div className="calgrid" style={{ ['--week' as string]: week }}>
            {calendar.weekdays.map((day, i) => (
              <div key={i} className="calgrid__weekday">{day}</div>
            ))}
            {/* Blanks before the first, so day 1 sits under its own weekday. */}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`pad${i}`} className="calgrid__pad" />
            ))}
            {Array.from({ length: length }, (_, i) => {
              const day = i + 1;
              const date = { year: at.year, month: at.month, day };
              const on = marked.filter((m) => occursOn(calendar, m.date, date));
              const moons = calendar.moons
                .map((moon) => ({ moon, phase: moonPhase(calendar, moon, date) }))
                // Only the quarters are worth marking; everything between is noise.
                .filter(({ phase }) => phase.index % 2 === 0);

              return (
                <div key={day} className={'calday' + (isToday(day) ? ' calday--today' : '')}>
                  <div className="calday__head">
                    <span className="calday__n">{day}</span>
                    {isToday(day) && <span className="calday__today">TODAY</span>}
                    {moons.map(({ moon, phase }) => (
                      <span
                        key={moon.id}
                        className="calday__moon"
                        style={{ ['--tint' as string]: moon.color }}
                        title={`${moon.name} — ${phase.name}`}
                      >
                        {phase.index === 0 ? '○' : phase.index === 4 ? '●' : '◐'}
                      </span>
                    ))}
                  </div>
                  {on.map((m) => {
                    const type = blockType(schema, m.page.type);
                    return (
                      <button
                        key={`${m.page.id}:${m.field.key}`}
                        className={'calevent' + (m.date.repeats ? ' calevent--repeats' : '')}
                        style={{ ['--tint' as string]: type.color }}
                        title={`${m.page.title} — ${m.field.label}, ${formatDate(calendar, m.date)}`}
                        onClick={() => openPage(m.page.id, m.page.boardId)}
                      >
                        <span className="calevent__dot" />
                        <span className="truncate">{m.page.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
