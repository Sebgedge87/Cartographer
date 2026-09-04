/**
 * World calendar arithmetic.
 *
 * Everything here is pure, and everything works in *absolute days*: day 1 is the
 * first day of year 1. Converting a date to a day number and back is the whole
 * trick — weekday, moon phase and any distance between two dates all fall out of
 * it, and none of them need to know how odd the months are.
 */

import type { LeapRule, Moon, WorldCalendar, WorldDate } from '../state/types';

export function isLeapYear(cal: WorldCalendar, year: number): boolean {
  const rule: LeapRule | null = cal.leap;
  if (!rule || rule.every < 1) return false;
  if (year % rule.every !== 0) return false;
  // Skipped, unless the un-skip rule rescues it. Earth: every 4, skip 100, keep 400.
  if (rule.skipEvery > 0 && year % rule.skipEvery === 0) {
    return rule.keepEvery > 0 && year % rule.keepEvery === 0;
  }
  return true;
}

/** Length of a month in a given year, leap day included. `month` is 1-based. */
export function daysInMonth(cal: WorldCalendar, year: number, month: number): number {
  const entry = cal.months[month - 1];
  if (!entry) return 0;
  const leapHere = cal.leap && cal.leap.monthIndex === month - 1 && isLeapYear(cal, year);
  return entry.days + (leapHere ? 1 : 0);
}

export function daysInYear(cal: WorldCalendar, year: number): number {
  return cal.months.reduce((sum, _m, i) => sum + daysInMonth(cal, year, i + 1), 0);
}

/** Days in a year with no leap day — the bulk of any span, computed once. */
function commonYearLength(cal: WorldCalendar): number {
  return cal.months.reduce((sum, m) => sum + m.days, 0);
}

/** How many leap years fall in years 1..year inclusive. */
function leapYearsUpTo(cal: WorldCalendar, year: number): number {
  const rule = cal.leap;
  if (!rule || rule.every < 1 || year < 1) return 0;
  const every = Math.floor(year / rule.every);
  if (rule.skipEvery <= 0) return every;
  const skipped = Math.floor(year / rule.skipEvery);
  const kept = rule.keepEvery > 0 ? Math.floor(year / rule.keepEvery) : 0;
  return every - skipped + kept;
}

/**
 * Absolute day number, counting the first day of year 1 as 1.
 *
 * Years are counted in bulk rather than looped, so a date ten thousand years out
 * costs the same as one next week.
 */
export function toDayNumber(cal: WorldCalendar, date: WorldDate): number {
  const common = commonYearLength(cal);
  const fullYears = date.year - 1;
  let days = fullYears * common + leapYearsUpTo(cal, fullYears);
  for (let m = 1; m < date.month; m++) days += daysInMonth(cal, date.year, m);
  return days + date.day;
}

/** The inverse: which date is day `n`. Clamped to year 1 for anything before it. */
export function fromDayNumber(cal: WorldCalendar, n: number): WorldDate {
  const common = commonYearLength(cal);
  if (common <= 0) return { year: 1, month: 1, day: 1 };
  if (n < 1) return { year: 1, month: 1, day: 1 };

  // Estimate the year from the average length, then walk the small error off.
  let year = Math.max(1, Math.floor((n - 1) / (common + 0.5)) + 1);
  while (toDayNumber(cal, { year, month: 1, day: 1 }) > n) year--;
  while (toDayNumber(cal, { year: year + 1, month: 1, day: 1 }) <= n) year++;

  let remaining = n - toDayNumber(cal, { year, month: 1, day: 1 }) + 1;
  let month = 1;
  for (; month <= cal.months.length; month++) {
    const length = daysInMonth(cal, year, month);
    if (remaining <= length) break;
    remaining -= length;
  }
  return { year, month: Math.min(month, cal.months.length), day: remaining };
}

/** Index into `weekdays`. Day 1 of year 1 is the first weekday. */
export function weekdayIndex(cal: WorldCalendar, date: WorldDate): number {
  const week = cal.weekdays.length;
  if (week <= 0) return 0;
  return (toDayNumber(cal, date) - 1) % week;
}

export function weekdayName(cal: WorldCalendar, date: WorldDate): string {
  return cal.weekdays[weekdayIndex(cal, date)] ?? '';
}

/* ---------- moons ---------- */

export const PHASE_NAMES = [
  'New',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
] as const;

/** How far through its cycle a moon is on this date, from 0 (new) to just under 1. */
export function moonFraction(cal: WorldCalendar, moon: Moon, date: WorldDate): number {
  if (moon.cycle <= 0) return 0;
  const since = toDayNumber(cal, date) - moon.newMoonOn;
  // Modulo that stays positive for dates before the reference new moon.
  return ((since % moon.cycle) + moon.cycle) % moon.cycle / moon.cycle;
}

/**
 * The named phase. The eight names divide the cycle into eight bands *centred* on
 * their name — a day either side of new is still called new, which is how a phase
 * is read in practice — so the bands are offset by half a band, not aligned to it.
 */
export function moonPhase(cal: WorldCalendar, moon: Moon, date: WorldDate): {
  fraction: number;
  index: number;
  name: string;
} {
  const fraction = moonFraction(cal, moon, date);
  const index = Math.floor(fraction * 8 + 0.5) % 8;
  return { fraction, index, name: PHASE_NAMES[index] ?? 'New' };
}

/**
 * How much of the disc is lit, 0 to 1. Follows the fraction round the cycle rather
 * than the named phase, so a drawn moon moves smoothly between names.
 */
export function moonIllumination(cal: WorldCalendar, moon: Moon, date: WorldDate): number {
  return (1 - Math.cos(moonFraction(cal, moon, date) * Math.PI * 2)) / 2;
}

/* ---------- text ---------- */

/** `year-month-day`, which is how a date is stored in a page field. */
export function serialiseDate(date: WorldDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

/** Parse a stored date. Returns null for anything that is not one. */
export function parseDate(value: string): WorldDate | null {
  const m = /^(-?\d+)-(\d+)-(\d+)$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

/** Pull a date back inside the calendar — a day past the month's end, a bad month. */
export function clampDate(cal: WorldCalendar, date: WorldDate): WorldDate {
  const year = Math.max(1, Math.round(date.year));
  const month = Math.min(Math.max(1, Math.round(date.month)), Math.max(1, cal.months.length));
  const day = Math.min(Math.max(1, Math.round(date.day)), Math.max(1, daysInMonth(cal, year, month)));
  return { year, month, day };
}

/** How a date reads: "12 Ashfall, 1147 AR". */
export function formatDate(cal: WorldCalendar, date: WorldDate): string {
  const month = cal.months[date.month - 1]?.name ?? `Month ${date.month}`;
  const era = cal.era ? ` ${cal.era}` : '';
  return `${date.day} ${month}, ${date.year}${era}`;
}
