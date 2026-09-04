import type { CalendarMonth, Moon, WorldCalendar } from '../state/types';
import { useDoc } from '../state/docStore';
import { daysInYear, moonIllumination, moonPhase } from '../lib/calendar';

const MOON_COLORS = ['#d8dde6', '#e0684f', '#6fb0e0', '#9b8ce0', '#66c39a', '#e0a44a'];

interface Props {
  projectId: string;
  calendar: WorldCalendar;
}

/**
 * The project's world calendar. Everything here is structure rather than content —
 * how long a year is, what the months are called, how the moons run — so it lives
 * beside the block types rather than on any page.
 */
export function CalendarEditor({ projectId, calendar }: Props) {
  const setCalendar = useDoc((s) => s.setCalendar);
  const patch = (next: Partial<WorldCalendar>) => setCalendar(projectId, { ...calendar, ...next });

  const setMonth = (index: number, next: Partial<CalendarMonth>) =>
    patch({ months: calendar.months.map((m, i) => (i === index ? { ...m, ...next } : m)) });

  const moveMonth = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= calendar.months.length) return;
    const months = calendar.months.slice();
    const [moved] = months.splice(index, 1);
    if (moved) months.splice(target, 0, moved);
    // The leap month is remembered by position, so it has to move with the month.
    const leap = calendar.leap
      ? {
          ...calendar.leap,
          monthIndex:
            calendar.leap.monthIndex === index
              ? target
              : calendar.leap.monthIndex === target
                ? index
                : calendar.leap.monthIndex,
        }
      : null;
    patch({ months, leap });
  };

  const removeMonth = (index: number) => {
    if (calendar.months.length <= 1) return;
    const leap = calendar.leap
      ? { ...calendar.leap, monthIndex: Math.max(0, Math.min(calendar.leap.monthIndex, calendar.months.length - 2)) }
      : null;
    patch({ months: calendar.months.filter((_, i) => i !== index), leap });
  };

  const setMoon = (id: string, next: Partial<Moon>) =>
    patch({ moons: calendar.moons.map((m) => (m.id === id ? { ...m, ...next } : m)) });

  const commonYear = calendar.months.reduce((sum, m) => sum + m.days, 0);
  const leapYear = daysInYear(calendar, calendar.leap ? calendar.leap.every : 1);

  return (
    <div className="calendar">
      <div className="calendar__row">
        <label className="calendar__field">
          <span className="calendar__label">Calendar name</span>
          <input className="field" value={calendar.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="calendar__field calendar__field--sm">
          <span className="calendar__label">Era suffix</span>
          <input className="field" value={calendar.era} onChange={(e) => patch({ era: e.target.value })} />
        </label>
        <label className="calendar__field calendar__field--sm">
          <span className="calendar__label">Hours in a day</span>
          <input
            className="field"
            type="number"
            min={1}
            value={calendar.hoursPerDay}
            onChange={(e) => patch({ hoursPerDay: Math.max(1, Number(e.target.value)) })}
          />
        </label>
        <div className="calendar__field calendar__field--sm">
          <span className="calendar__label">Year length</span>
          <div className="calendar__readout">
            {commonYear} days
            {calendar.leap && leapYear !== commonYear ? ` · ${leapYear} in a leap year` : ''}
          </div>
        </div>
      </div>

      {/* ---- months ---- */}
      <div className="calendar__head">
        <span className="label">Months</span>
        <span className="schema__note">In order, with the days each holds</span>
        <span className="spacer" />
        <button
          className="btn btn--sm"
          onClick={() => patch({ months: [...calendar.months, { name: 'New month', days: 30 }] })}
        >
          + MONTH
        </button>
      </div>
      <div className="calendar__months">
        {calendar.months.map((month, i) => (
          <div key={i} className={'cal-month' + (calendar.leap?.monthIndex === i ? ' cal-month--leap' : '')}>
            <span className="cal-month__n">{i + 1}</span>
            <input className="field" value={month.name} onChange={(e) => setMonth(i, { name: e.target.value })} />
            <input
              className="field cal-month__days"
              type="number"
              min={1}
              value={month.days}
              onChange={(e) => setMonth(i, { days: Math.max(1, Number(e.target.value)) })}
            />
            <button className="icon-btn" title="Move earlier" onClick={() => moveMonth(i, -1)}>▴</button>
            <button className="icon-btn" title="Move later" onClick={() => moveMonth(i, 1)}>▾</button>
            <button
              className="icon-btn"
              disabled={calendar.months.length <= 1}
              title={calendar.months.length <= 1 ? 'A year needs at least one month' : 'Delete this month'}
              onClick={() => removeMonth(i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* ---- week ---- */}
      <div className="calendar__head">
        <span className="label">Week</span>
        <span className="schema__note">
          {calendar.weekdays.length} day{calendar.weekdays.length === 1 ? '' : 's'} — the list length is the week
        </span>
        <span className="spacer" />
        <button
          className="btn btn--sm"
          onClick={() => patch({ weekdays: [...calendar.weekdays, `Day ${calendar.weekdays.length + 1}`] })}
        >
          + DAY
        </button>
      </div>
      <div className="calendar__weekdays">
        {calendar.weekdays.map((day, i) => (
          <div key={i} className="cal-day">
            <input
              className="field"
              value={day}
              onChange={(e) => patch({ weekdays: calendar.weekdays.map((d, j) => (j === i ? e.target.value : d)) })}
            />
            <button
              className="icon-btn"
              disabled={calendar.weekdays.length <= 1}
              title={calendar.weekdays.length <= 1 ? 'A week needs at least one day' : 'Delete this day'}
              onClick={() => patch({ weekdays: calendar.weekdays.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* ---- leap ---- */}
      <div className="calendar__head">
        <span className="label">Leap day</span>
        <span className="schema__note">A day added every so many years, to keep the year honest</span>
        <span className="spacer" />
        <button
          className={'btn btn--sm' + (calendar.leap ? ' btn--on' : '')}
          onClick={() =>
            patch({ leap: calendar.leap ? null : { every: 4, skipEvery: 0, keepEvery: 0, monthIndex: 1 } })
          }
        >
          {calendar.leap ? 'ON' : 'OFF'}
        </button>
      </div>
      {calendar.leap && (
        <div className="calendar__row">
          <label className="calendar__field calendar__field--sm">
            <span className="calendar__label">Every</span>
            <input
              className="field" type="number" min={1} value={calendar.leap.every}
              onChange={(e) => patch({ leap: { ...calendar.leap!, every: Math.max(1, Number(e.target.value)) } })}
            />
          </label>
          <label className="calendar__field calendar__field--sm">
            <span className="calendar__label">…but not every</span>
            <input
              className="field" type="number" min={0} value={calendar.leap.skipEvery}
              onChange={(e) => patch({ leap: { ...calendar.leap!, skipEvery: Math.max(0, Number(e.target.value)) } })}
            />
          </label>
          <label className="calendar__field calendar__field--sm">
            <span className="calendar__label">…except every</span>
            <input
              className="field" type="number" min={0} value={calendar.leap.keepEvery}
              onChange={(e) => patch({ leap: { ...calendar.leap!, keepEvery: Math.max(0, Number(e.target.value)) } })}
            />
          </label>
          <label className="calendar__field">
            <span className="calendar__label">Added to</span>
            <select
              className="field"
              value={calendar.leap.monthIndex}
              onChange={(e) => patch({ leap: { ...calendar.leap!, monthIndex: Number(e.target.value) } })}
            >
              {calendar.months.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
            </select>
          </label>
          <div className="calendar__note">
            {calendar.leap.skipEvery > 0
              ? `A day every ${calendar.leap.every} years, skipped every ${calendar.leap.skipEvery}` +
                (calendar.leap.keepEvery > 0 ? `, kept every ${calendar.leap.keepEvery}.` : '.')
              : `A day every ${calendar.leap.every} years.`}
          </div>
        </div>
      )}

      {/* ---- moons ---- */}
      <div className="calendar__head">
        <span className="label">Moons</span>
        <span className="schema__note">Cycle length in days, and the day one was last new</span>
        <span className="spacer" />
        <button
          className="btn btn--sm"
          onClick={() =>
            patch({
              moons: [...calendar.moons, {
                id: 'moon' + Math.random().toString(36).slice(2, 7),
                name: `Moon ${calendar.moons.length + 1}`,
                cycle: 28,
                newMoonOn: 1,
                color: MOON_COLORS[calendar.moons.length % MOON_COLORS.length] ?? '#d8dde6',
              }],
            })
          }
        >
          + MOON
        </button>
      </div>
      {calendar.moons.length === 0 && <div className="none-line">NO MOONS</div>}
      <div className="calendar__moons">
        {calendar.moons.map((moon) => {
          const today = { year: 1, month: 1, day: 1 };
          return (
            <div key={moon.id} className="cal-moon" style={{ ['--tint' as string]: moon.color }}>
              <div className="cal-moon__head">
                <input className="field" value={moon.name} onChange={(e) => setMoon(moon.id, { name: e.target.value })} />
                <button
                  className="icon-btn"
                  title="Delete this moon"
                  onClick={() => patch({ moons: calendar.moons.filter((m) => m.id !== moon.id) })}
                >
                  ×
                </button>
              </div>
              <div className="cal-moon__row">
                <label className="calendar__field calendar__field--sm">
                  <span className="calendar__label">Cycle (days)</span>
                  <input
                    className="field" type="number" min={0.5} step={0.5} value={moon.cycle}
                    onChange={(e) => setMoon(moon.id, { cycle: Math.max(0.5, Number(e.target.value)) })}
                  />
                </label>
                <label className="calendar__field calendar__field--sm">
                  <span className="calendar__label">New on day</span>
                  <input
                    className="field" type="number" value={moon.newMoonOn}
                    onChange={(e) => setMoon(moon.id, { newMoonOn: Number(e.target.value) })}
                  />
                </label>
                <label className="calendar__field calendar__field--sm">
                  <span className="calendar__label">Colour</span>
                  <input
                    className="field cal-moon__color" type="color" value={moon.color}
                    onChange={(e) => setMoon(moon.id, { color: e.target.value })}
                  />
                </label>
              </div>
              <div className="cal-moon__phase">
                On the first day of year 1 it is{' '}
                <b>{moonPhase(calendar, moon, today).name.toLowerCase()}</b>, {' '}
                {Math.round(moonIllumination(calendar, moon, today) * 100)}% lit.
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
