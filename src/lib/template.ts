/**
 * The starter file for **Home → IMPORT JSON**.
 *
 * Built in code rather than shipped as a static asset, and shipped to the repo's
 * templates/ from this same function, so the example and the importer cannot drift
 * apart: a field renamed in one is renamed in both, and the round-trip test below
 * fails the build if the file this produces stops importing.
 *
 * It is deliberately written the way someone would write it by hand — ids that
 * read as names, no coordinates, no timestamps — because that is the file anyone
 * actually types. Everything the importer can fill in is left out, and the one
 * comment field says so.
 */

/** A hand-written file, not the full export shape: most of it is optional. */
export interface TemplateFile {
  format: string;
  _readme: string;
  project: { name: string; system: string; accent: string };
  areas: { id: string; name: string; defaultType: string }[];
  boards: { id: string; areaId: string; name: string }[];
  types: Record<string, {
    label: string;
    code: string;
    color: string;
    fields: { key: string; label: string; kind: string; options?: string[]; wide?: boolean }[];
  }>;
  typeOrder: string[];
  calendar: {
    name: string;
    months: { name: string; days: number }[];
    weekdays: string[];
    hoursPerDay: number;
    era: string;
    leap: { every: number; skipEvery: number; keepEvery: number; monthIndex: number } | null;
    moons: { id: string; name: string; cycle: number; newMoonOn: number; color: string }[];
    today: { year: number; month: number; day: number };
  };
  dictionary: string[];
  pages: {
    id: string;
    boardId: string;
    type: string;
    title: string;
    tags?: string[];
    fields?: Record<string, string>;
    body?: string;
  }[];
  links: { from: string; to: string }[];
}

export function templateProject(): TemplateFile {
  return {
    format: 'cartographer/v1',
    _readme:
      'Only "pages" is required — everything else has a sensible default. Ids are '
      + 'yours to choose and only have to match each other within this file. A page '
      + 'may name its board by id; leave it out and one is invented. Field values are '
      + 'keyed by the field\'s "key". [[Double brackets]] link to another page by '
      + 'title. Delete this line before importing if you like; it is ignored.',

    project: {
      name: 'The Ashen Reach',
      system: 'Homebrew · d6 pool',
      accent: '#c98a3a',
    },

    areas: [
      { id: 'locations', name: 'Locations', defaultType: 'location' },
      { id: 'people', name: 'People', defaultType: 'npc' },
    ],

    boards: [
      { id: 'the-reach', areaId: 'locations', name: 'The Reach' },
      { id: 'the-guild', areaId: 'people', name: 'The Merchant Guild' },
    ],

    types: {
      location: {
        label: 'Location',
        code: 'LOC',
        color: '#4a8f7b',
        fields: [
          { key: 'ruler', label: 'Ruler', kind: 'ref' },
          { key: 'population', label: 'Population', kind: 'number' },
          // A 'select' offers exactly these choices and nothing else.
          { key: 'threat', label: 'Threat', kind: 'select', options: ['Calm', 'Tense', 'Hostile'] },
          { key: 'founded', label: 'Founded', kind: 'date' },
          { key: 'notes', label: 'Notes', kind: 'long', wide: true },
        ],
      },
      npc: {
        label: 'NPC',
        code: 'NPC',
        color: '#b4633f',
        fields: [
          { key: 'role', label: 'Role', kind: 'text' },
          { key: 'allegiance', label: 'Allegiance', kind: 'select', options: ['Guild', 'Crown', 'Neither'] },
          { key: 'home', label: 'Home', kind: 'ref' },
          { key: 'notes', label: 'Notes', kind: 'long', wide: true },
        ],
      },
    },
    typeOrder: ['location', 'npc'],

    // The world's own calendar. Every `date` field is written and read through it,
    // and the timeline orders by it. Months can be any length and the week any
    // number of days — this one has five.
    calendar: {
      name: 'Reach Reckoning',
      months: [
        { name: 'Emberfall', days: 30 },
        { name: 'Hollowtide', days: 30 },
        { name: 'Kilnrise', days: 31 },
        { name: 'Saltwane', days: 30 },
      ],
      weekdays: ['Kiln', 'Ash', 'Salt', 'Reed', 'Rest'],
      hoursPerDay: 24,
      era: 'AR',
      leap: { every: 4, skipEvery: 0, keepEvery: 0, monthIndex: 1 },
      moons: [
        { id: 'vess', name: 'Vess', cycle: 29.5, newMoonOn: 0, color: '#cdd6e4' },
      ],
      today: { year: 412, month: 2, day: 14 },
    },

    // Words the spellchecker should accept. Names already in the project — page
    // titles, areas, month names — are picked up on their own, so this is only for
    // anything nothing else in the file says.
    dictionary: ['kilnmaster', 'silts'],

    pages: [
      {
        id: 'emberhold',
        boardId: 'the-reach',
        type: 'location',
        title: 'Emberhold',
        tags: ['Frontier', 'Merchant Guild'],
        fields: {
          ruler: 'Mara Vell',
          population: '2100',
          threat: 'Tense',
          // A date is year-month-day in the calendar above, months and days 1-based.
          founded: '318-3-2',
          notes: 'Ash falls for a week after every firing of the kilns.',
        },
        body:
          'A stone town above the ash flats, built around kilns that have not gone '
          + 'cold in ninety years.\n\n'
          + '## The Kilns\n\n'
          + 'Guild-owned, Crown-taxed, and the reason anyone lives here.\n\n'
          + 'Its ruler is [[Mara Vell]], who answers to nobody in [[Saltmarsh]].',
      },
      {
        id: 'saltmarsh',
        boardId: 'the-reach',
        type: 'location',
        title: 'Saltmarsh',
        tags: ['Coastal'],
        fields: { population: '400', threat: 'Calm' },
        body: 'Reeds, fog, and a harbour that silts up faster than it can be dredged.',
      },
      {
        id: 'mara-vell',
        boardId: 'the-guild',
        type: 'npc',
        title: 'Mara Vell',
        tags: ['Merchant Guild'],
        // A 'ref' field points at a page by its id — "emberhold", not "Emberhold".
        fields: { role: 'Kilnmaster', allegiance: 'Guild', home: 'emberhold' },
        body: 'Runs the kilns, and most of what the kilns pay for.',
      },
    ],

    // Links you draw by hand. Anything written as [[Title]] in a body is found on
    // its own and does not belong here.
    links: [
      { from: 'emberhold', to: 'saltmarsh' },
    ],
  };
}

/** Hand the starter file to the browser as a download. */
export function downloadTemplate(): void {
  const body = JSON.stringify(templateProject(), null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template.cartographer.json';
  a.click();
  URL.revokeObjectURL(url);
}
