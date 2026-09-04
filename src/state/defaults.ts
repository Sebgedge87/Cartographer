import type { BlockType, Doc, Field, ProjectSchema, WorldCalendar } from './types';

const f = (key: string, label: string, kind: Field['kind'] = 'text'): Field => ({ key, label, kind });
const T = (label: string, code: string, color: string, fields: Field[]): BlockType => ({ label, code, color, fields });

/**
 * The block types a new project starts with — a starting point, not a commitment.
 * Every label, field and colour here is editable per project in the schema view,
 * and types can be deleted outright, which is what keeps the app system-agnostic.
 */
export function starterTypes(): Record<string, BlockType> {
  return {
    creature: T('Creature', 'CRE', '#e0684f', [f('threat', 'Threat'), f('hp', 'Vitality', 'number'), f('speed', 'Speed'), f('defence', 'Defence'), f('drive', 'Drive')]),
    npc: T('NPC', 'NPC', '#d98cc0', [f('role', 'Role'), f('faction', 'Faction', 'ref'), f('attitude', 'Attitude'), f('seen_at', 'Seen at', 'ref')]),
    weapon: T('Weapon', 'WPN', '#e0a44a', [f('damage', 'Damage'), f('range', 'Range'), f('hands', 'Hands', 'number'), f('traits', 'Traits')]),
    armour: T('Armour', 'ARM', '#8fa5c9', [f('protection', 'Protection'), f('bulk', 'Bulk', 'number'), f('traits', 'Traits')]),
    item: T('Item', 'ITM', '#66c39a', [f('rarity', 'Rarity'), f('value', 'Value'), f('effect', 'Effect')]),
    spell: T('Ability', 'ABL', '#9b8ce0', [f('cost', 'Cost'), f('range', 'Range'), f('duration', 'Duration'), f('effect', 'Effect')]),
    location: T('Location', 'LOC', '#6fb0e0', [f('region', 'Region'), f('danger', 'Danger'), f('holds', 'Held by', 'ref')]),
    faction: T('Faction', 'FAC', '#c9a26b', [f('scope', 'Scope'), f('goal', 'Goal'), f('asset', 'Key asset')]),
    table: T('Table', 'TBL', '#7fbf6f', [f('die', 'Die'), f('scope', 'Scope')]),
    rule: T('Rule', 'RUL', '#a0a8b4', [f('category', 'Category'), f('phase', 'Phase')]),
    note: T('Note', 'NTE', '#8a919e', []),
    image: T('Image', 'IMG', '#cf9a7a', [f('source', 'Source'), f('credit', 'Credit')]),
    blank: T('Blank', 'BLK', '#8a919e', []),
  };
}

export const STARTER_ORDER = [
  'creature', 'npc', 'weapon', 'armour', 'item', 'spell',
  'location', 'faction', 'table', 'rule', 'note', 'image', 'blank',
];

/**
 * The calendar a new project starts with: Earth's shape, none of its names. Twelve
 * months and a seven-day week are what most invented settings quietly keep, and the
 * ones that do not are exactly the projects whose owners will rewrite this anyway.
 * Two moons because one is the boring case and the plural is the point.
 */
export function starterCalendar(): WorldCalendar {
  return {
    name: 'Common Reckoning',
    months: [
      { name: 'Frostwane', days: 31 },
      { name: 'Thawing', days: 28 },
      { name: 'Seedfall', days: 31 },
      { name: 'Greening', days: 30 },
      { name: 'Highsun', days: 31 },
      { name: 'Longlight', days: 30 },
      { name: 'Goldwane', days: 31 },
      { name: 'Harvestide', days: 31 },
      { name: 'Emberfall', days: 30 },
      { name: 'Ashfall', days: 31 },
      { name: 'Duskrise', days: 30 },
      { name: 'Deepdark', days: 31 },
    ],
    weekdays: ['Sunsday', 'Moonsday', 'Forgeday', 'Wardsday', 'Thornsday', 'Farsday', 'Restday'],
    hoursPerDay: 24,
    era: 'CR',
    leap: { every: 4, skipEvery: 100, keepEvery: 400, monthIndex: 1 },
    moons: [
      { id: 'moon1', name: 'The Pale', cycle: 29.5, newMoonOn: 1, color: '#d8dde6' },
      { id: 'moon2', name: 'Ember', cycle: 43, newMoonOn: 12, color: '#e0684f' },
    ],
    today: { year: 1147, month: 10, day: 12 },
  };
}

export function starterSchema(): ProjectSchema {
  return { types: starterTypes(), typeOrder: STARTER_ORDER.slice(), calendar: starterCalendar() };
}

/** 'blank' is always present and is never listed in the schema grid. */
/**
 * A short tag for a type, from its label. Three letters reads as an abbreviation —
 * NPC, LOC, WPN — where two reads as a code you have to learn.
 */
export function codeFor(label: string): string {
  const words = label.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return 'NEW';
  // An acronym already: keep it. "NPC" should not become "NPC"[0..3] of nothing.
  if (words.length === 1 && words[0]!.length <= 3) return words[0]!.toUpperCase();
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]!).join('').toUpperCase();
  if (words.length === 2) return (words[0]!.slice(0, 2) + words[1]![0]!).toUpperCase();
  // One long word: the first three letters. Predictable beats clever — dropping
  // vowels turns Location into LCT, which nobody would guess from typing it.
  return words[0]!.slice(0, 3).toUpperCase();
}

/**
 * The two-letter codes this app shipped with, by type key. A project made before
 * three-letter tags carries these, and they are upgraded on load — but only where
 * the code is still the one we set, so a code someone changed is left alone.
 */
const LEGACY_CODES: Record<string, string> = {
  creature: 'CR', npc: 'NP', weapon: 'WP', armour: 'AR', item: 'IT', spell: 'AB',
  location: 'LO', faction: 'FC', table: 'TB', rule: 'RL', note: 'NT', image: 'IM',
  blank: 'BL',
};

export function normaliseSchema(schema: ProjectSchema): ProjectSchema {
  const starters = starterTypes();
  // Projects made before calendars existed have none; give them the starter one
  // rather than leaving every date field with nothing to measure itself against.
  const calendar = normaliseCalendar(schema.calendar);
  const types = { ...schema.types };
  for (const [key, type] of Object.entries(types)) {
    if (type.code === LEGACY_CODES[key] && starters[key]) {
      types[key] = { ...type, code: starters[key]!.code };
    }
  }
  if (!types.blank) types.blank = T('Blank', 'BLK', '#8a919e', []);
  const typeOrder = schema.typeOrder.includes('blank') ? schema.typeOrder.slice() : [...schema.typeOrder, 'blank'];
  return { types, typeOrder, calendar };
}

/** Fill in anything a stored or imported calendar is missing, or make a whole one. */
export function normaliseCalendar(calendar: WorldCalendar | undefined): WorldCalendar {
  const base = starterCalendar();
  if (!calendar) return base;
  const months = Array.isArray(calendar.months) && calendar.months.length ? calendar.months : base.months;
  const weekdays = Array.isArray(calendar.weekdays) && calendar.weekdays.length
    ? calendar.weekdays
    : base.weekdays;
  return {
    name: calendar.name || base.name,
    months: months.map((m) => ({ name: m.name || 'Unnamed', days: Math.max(1, Math.round(m.days || 1)) })),
    weekdays,
    hoursPerDay: Math.max(1, Math.round(calendar.hoursPerDay || base.hoursPerDay)),
    era: calendar.era ?? base.era,
    leap: calendar.leap ?? null,
    moons: Array.isArray(calendar.moons) ? calendar.moons : [],
    today: calendar.today ?? base.today,
  };
}

/**
 * What a first run looks like: nothing. The home screen offers a blank project and
 * an importer, and the first project you make defines its own labels from
 * `starterSchema()`.
 */
export function emptyDoc(): Doc {
  return { projects: [], areas: [], boards: [], pages: [], edges: [], schemas: {} };
}
