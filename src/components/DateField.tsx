import type { WorldCalendar, WorldDate } from '../state/types';
import {
  clampDate, daysInMonth, formatDate, moonIllumination, moonPhase, parseDate, serialiseDate,
  weekdayName,
} from '../lib/calendar';

interface Props {
  calendar: WorldCalendar;
  value: string;
  onChange: (next: string) => void;
}

/**
 * A moon, drawn as a disc lit from one side. The lit fraction comes from the
 * calendar; the waxing half of the cycle is lit on the right, the waning half on
 * the left, which is what makes a crescent legible as growing or shrinking.
 */
function MoonDisc({ lit, waxing, color, size = 13 }: {
  lit: number; waxing: boolean; color: string; size?: number;
}) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flex: 'none' }}>
      <circle cx="10" cy="10" r="9" fill="rgba(255,255,255,.07)" stroke={color} strokeOpacity=".5" />
      <defs>
        <clipPath id={`m${r}${lit.toFixed(3)}${waxing ? 'w' : 'n'}`}>
          <rect x={waxing ? 10 : 1} y="1" width="9" height="18" />
        </clipPath>
      </defs>
      {/* The terminator is an ellipse whose width tracks how much is lit. */}
      <ellipse cx="10" cy="10" rx={Math.abs(lit - 0.5) * 18} ry="9" fill={lit > 0.5 ? color : 'transparent'} />
      <circle
        cx="10" cy="10" r="9" fill={color}
        clipPath={`url(#m${r}${lit.toFixed(3)}${waxing ? 'w' : 'n'})`}
        opacity={lit > 0.02 ? 1 : 0}
      />
      {lit > 0.5 && <ellipse cx="10" cy="10" rx={(1 - lit) * 18} ry="9" fill={color} />}
    </svg>
  );
}

/**
 * A date in the project's own calendar: year, month and day, with the weekday and
 * every moon's phase read off underneath. The month list and the day ceiling come
 * from the calendar, so a 40-day month or a leap day needs nothing here.
 */
export function DateField({ calendar, value, onChange }: Props) {
  const parsed = parseDate(value);
  const date = parsed ? clampDate(calendar, parsed) : null;

  const set = (patch: Partial<WorldDate>) => {
    // A new date starts at the present: you are nearly always writing about
    // something near now, not near the dawn of the calendar.
    const base = date ?? calendar.today;
    onChange(serialiseDate(clampDate(calendar, { ...base, ...patch })));
  };

  if (!date) {
    return (
      <button className="field date-field__empty" onClick={() => set({})}>
        Set a date
      </button>
    );
  }

  const maxDay = daysInMonth(calendar, date.year, date.month);

  return (
    <div className="date-field">
      <div className="date-field__row">
        <input
          className="field date-field__day"
          type="number"
          min={1}
          max={maxDay}
          value={date.day}
          onChange={(e) => set({ day: Number(e.target.value) })}
        />
        <select
          className="field date-field__month"
          value={date.month}
          onChange={(e) => set({ month: Number(e.target.value) })}
        >
          {calendar.months.map((m, i) => (
            <option key={m.name + i} value={i + 1}>{m.name}</option>
          ))}
        </select>
        <input
          className="field date-field__year"
          type="number"
          min={1}
          value={date.year}
          onChange={(e) => set({ year: Number(e.target.value) })}
        />
        <button
          className="date-field__clear"
          title="Clear this date"
          onClick={() => onChange('')}
        >
          ×
        </button>
      </div>

      <div className="date-field__read">
        <span className="date-field__weekday">{weekdayName(calendar, date)}</span>
        <span className="date-field__full">{formatDate(calendar, date)}</span>
        <button
          className={'date-field__repeat' + (date.repeats ? ' date-field__repeat--on' : '')}
          aria-pressed={!!date.repeats}
          title={
            date.repeats
              ? 'Comes round every year — shown on the calendar'
              : 'Mark as a holiday or anniversary: it then comes round every year and appears on the calendar'
          }
          onClick={() => set({ repeats: !date.repeats })}
        >
          {date.repeats ? '↻ EVERY YEAR' : '↻ ONCE'}
        </button>
      </div>

      {calendar.moons.length > 0 && (
        <div className="date-field__moons">
          {calendar.moons.map((moon) => {
            const phase = moonPhase(calendar, moon, date);
            return (
              <span key={moon.id} className="moon" title={`${moon.name} — ${phase.name}`}>
                <MoonDisc
                  lit={moonIllumination(calendar, moon, date)}
                  waxing={phase.fraction < 0.5}
                  color={moon.color}
                />
                <span className="moon__name truncate">{moon.name}</span>
                <span className="moon__phase truncate">{phase.name}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
