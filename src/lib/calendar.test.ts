import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorldCalendar } from '../state/types';
import {
  clampDate, daysInMonth, daysInYear, formatDate, fromDayNumber, isLeapYear,
  moonIllumination, moonPhase, parseDate, serialiseDate, toDayNumber, weekdayName,
} from './calendar';

/** A small, awkward calendar: three months of unequal length, a four-day week. */
const cal: WorldCalendar = {
  name: 'Test',
  months: [
    { name: 'Alpha', days: 10 },
    { name: 'Beta', days: 5 },
    { name: 'Gamma', days: 7 },
  ],
  weekdays: ['One', 'Two', 'Three', 'Four'],
  hoursPerDay: 20,
  era: 'TR',
  leap: { every: 4, skipEvery: 0, keepEvery: 0, monthIndex: 1 },
  moons: [{ id: 'm', name: 'Pale', cycle: 8, newMoonOn: 1, color: '#fff' }],
};

const earth: WorldCalendar = {
  ...cal,
  months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((d, i) => ({ name: `M${i + 1}`, days: d })),
  weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  leap: { every: 4, skipEvery: 100, keepEvery: 400, monthIndex: 1 },
  moons: [],
};

test('a leap year adds a day to one month, not to the others', () => {
  assert.equal(isLeapYear(cal, 4), true);
  assert.equal(isLeapYear(cal, 5), false);
  assert.equal(daysInMonth(cal, 4, 2), 6);
  assert.equal(daysInMonth(cal, 5, 2), 5);
  assert.equal(daysInMonth(cal, 4, 1), 10);
  assert.equal(daysInYear(cal, 4), 23);
  assert.equal(daysInYear(cal, 5), 22);
});

test('the skip and keep rules follow the Gregorian pattern', () => {
  assert.equal(isLeapYear(earth, 1996), true);
  assert.equal(isLeapYear(earth, 1900), false, '1900 is divisible by 100 and skipped');
  assert.equal(isLeapYear(earth, 2000), true, '2000 is divisible by 400 and kept');
  assert.equal(daysInYear(earth, 2000), 366);
  assert.equal(daysInYear(earth, 1900), 365);
});

test('day numbers start at one and count straight through', () => {
  assert.equal(toDayNumber(cal, { year: 1, month: 1, day: 1 }), 1);
  assert.equal(toDayNumber(cal, { year: 1, month: 2, day: 1 }), 11);
  assert.equal(toDayNumber(cal, { year: 1, month: 3, day: 7 }), 22);
  assert.equal(toDayNumber(cal, { year: 2, month: 1, day: 1 }), 23);
});

test('a date survives the round trip to a day number and back', () => {
  for (let n = 1; n < 400; n++) {
    const date = fromDayNumber(cal, n);
    assert.equal(toDayNumber(cal, date), n, `day ${n} came back as ${serialiseDate(date)}`);
  }
});

test('the round trip holds across a leap century on an Earth-shaped calendar', () => {
  for (const date of [
    { year: 1899, month: 12, day: 31 },
    { year: 1900, month: 2, day: 28 },
    { year: 1900, month: 3, day: 1 },
    { year: 2000, month: 2, day: 29 },
    { year: 2024, month: 6, day: 15 },
  ]) {
    assert.deepEqual(fromDayNumber(earth, toDayNumber(earth, date)), date);
  }
});

test('weekdays cycle with the length of the week, not with the month', () => {
  assert.equal(weekdayName(cal, { year: 1, month: 1, day: 1 }), 'One');
  assert.equal(weekdayName(cal, { year: 1, month: 1, day: 5 }), 'One');
  assert.equal(weekdayName(cal, { year: 1, month: 1, day: 4 }), 'Four');
});

test('a moon is new on its reference day and full half a cycle later', () => {
  const moon = cal.moons[0]!;
  assert.equal(moonPhase(cal, moon, { year: 1, month: 1, day: 1 }).name, 'New');
  assert.equal(moonPhase(cal, moon, { year: 1, month: 1, day: 5 }).name, 'Full');
  assert.equal(moonPhase(cal, moon, { year: 1, month: 1, day: 9 }).name, 'New', 'one cycle on');
  assert.ok(moonIllumination(cal, moon, { year: 1, month: 1, day: 1 }) < 0.01);
  assert.ok(moonIllumination(cal, moon, { year: 1, month: 1, day: 5 }) > 0.99);
});

test('a fractional cycle drifts rather than repeating', () => {
  const half = { ...cal.moons[0]!, cycle: 8.5 };
  const first = moonPhase(cal, half, { year: 1, month: 1, day: 1 }).fraction;
  const later = moonPhase(cal, half, { year: 1, month: 1, day: 9 }).fraction;
  assert.notEqual(first, later);
});

test('dates serialise and parse back, and rubbish parses to null', () => {
  assert.equal(serialiseDate({ year: 1147, month: 3, day: 12 }), '1147-3-12');
  assert.deepEqual(parseDate('1147-3-12'), { year: 1147, month: 3, day: 12 });
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
});

test('clamping pulls a date back inside the calendar', () => {
  assert.deepEqual(clampDate(cal, { year: 5, month: 2, day: 99 }), { year: 5, month: 2, day: 5 });
  assert.deepEqual(clampDate(cal, { year: 4, month: 2, day: 6 }), { year: 4, month: 2, day: 6 });
  assert.deepEqual(clampDate(cal, { year: 0, month: 9, day: 0 }), { year: 1, month: 3, day: 1 });
});

test('a date reads with its month name and era', () => {
  assert.equal(formatDate(cal, { year: 1147, month: 3, day: 12 }), '12 Gamma, 1147 TR');
});
