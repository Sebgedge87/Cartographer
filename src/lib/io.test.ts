import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseProjectFile } from './io';

const load = (name: string) => parseProjectFile(readFileSync(`templates/${name}`, 'utf8'));

test('rejects anything that is not a project file', () => {
  assert.equal(parseProjectFile('not json'), null);
  assert.equal(parseProjectFile('{}'), null);
  assert.equal(parseProjectFile('{"pages":"nope"}'), null);
});

test('the smallest useful file is a name and some titles', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    project: { name: 'Imported notes' },
    pages: [{ title: 'One' }, { title: 'Two' }],
  }));
  assert.ok(file);
  assert.equal(file.project.name, 'Imported notes');
  // An area and a board are invented, because a page cannot exist without them.
  assert.equal(file.areas.length, 1);
  assert.equal(file.boards.length, 1);
  assert.equal(file.boards[0]!.areaId, file.areas[0]!.id);
  assert.equal(file.pages[0]!.boardId, file.boards[0]!.id);
});

test('a page is completed rather than trusted', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    pages: [{ title: 'Bare' }],
  }));
  const page = file!.pages[0]!;
  assert.deepEqual(page.fields, {});
  assert.deepEqual(page.images, []);
  assert.equal(page.custom, null);
  assert.equal(page.header, null);
  assert.equal(page.cols, 0);
  assert.equal(page.body, '');
  assert.ok(page.id);
  assert.ok(page.updated > 0);
  assert.equal(page.w, 244);
});

test('pages with no coordinates are laid out in a grid, not stacked', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    pages: Array.from({ length: 6 }, (_, i) => ({ title: `P${i}` })),
  }));
  const points = file!.pages.map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(points).size, 6);
  // Four to a row, so the fifth drops to a new one.
  assert.equal(file!.pages[4]!.x, file!.pages[0]!.x);
  assert.ok(file!.pages[4]!.y > file!.pages[0]!.y);
});

test('a given position is kept', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    pages: [{ title: 'Placed', x: 620, y: 400 }],
  }));
  assert.equal(file!.pages[0]!.x, 620);
  assert.equal(file!.pages[0]!.y, 400);
});

test('a page takes its area’s default type when it names none', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    areas: [{ id: 'a1', name: 'Cast', defaultType: 'npc' }],
    boards: [{ id: 'b1', areaId: 'a1', name: 'People' }],
    pages: [{ title: 'Someone', boardId: 'b1' }, { title: 'Explicit', boardId: 'b1', type: 'note' }],
  }));
  assert.equal(file!.pages[0]!.type, 'npc');
  assert.equal(file!.pages[1]!.type, 'note');
});

test('links to pages the file does not contain are dropped', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    pages: [{ id: 'n1', title: 'One' }],
    links: [
      { id: 'e1', from: 'n1', to: 'missing', kind: 'manual' },
      { id: 'e2', from: 'n1', to: 'n1', kind: 'manual' },
    ],
  }));
  assert.deepEqual(file!.links.map((e) => e.id), ['e2']);
});

test('a ref written as a title becomes the page’s id', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    types: { npc: { label: 'NPC', code: 'NPC', color: '#fff', fields: [{ key: 'faction', label: 'Faction', kind: 'ref' }] } },
    pages: [
      { id: 'n-them', title: 'The Nine Sightless' },
      { id: 'n-her', title: 'Mirrorwalker', type: 'npc', fields: { faction: 'The Nine Sightless' } },
      { id: 'n-him', title: 'Ashcoat', type: 'npc', fields: { faction: 'n-them' } },
      { id: 'n-none', title: 'Nobody', type: 'npc', fields: { faction: 'Not a page' } },
    ],
  }));
  assert.equal(file!.pages[1]!.fields.faction, 'n-them');
  // An id already written as an id is left alone.
  assert.equal(file!.pages[2]!.fields.faction, 'n-them');
  // And a title matching nothing stays as it was rather than being invented.
  assert.equal(file!.pages[3]!.fields.faction, 'Not a page');
});

test('an ambiguous title is not guessed at', () => {
  const file = parseProjectFile(JSON.stringify({
    format: 'cartographer/v1',
    types: { npc: { label: 'NPC', code: 'NPC', color: '#fff', fields: [{ key: 'faction', label: 'Faction', kind: 'ref' }] } },
    pages: [
      { id: 'n1', title: 'Twins' },
      { id: 'n2', title: 'Twins' },
      { id: 'n3', title: 'Someone', type: 'npc', fields: { faction: 'Twins' } },
    ],
  }));
  assert.equal(file!.pages[2]!.fields.faction, 'Twins');
});

test('the shipped templates both parse', () => {
  const minimal = load('minimal.cartographer.json');
  assert.ok(minimal);
  assert.equal(minimal.pages.length, 3);
  assert.ok(minimal.pages.every((p) => p.boardId && p.projectId));

  const full = load('project.cartographer.json');
  assert.ok(full);
  assert.equal(full.project.name, 'Example Setting');
  assert.equal(full.areas.length, 2);
  assert.equal(full.boards.length, 2);
  assert.equal(full.pages.length, 5);
  assert.equal(full.links.length, 1);
  assert.ok(full.calendar);
  assert.deepEqual(full.dictionary, ['Ashcoat', 'Mirrorwalker']);
  // Every page lands on a board the file declares.
  const boards = new Set(full.boards.map((b) => b.id));
  assert.ok(full.pages.every((p) => boards.has(p.boardId)));
  // And every type a page names is one the file defines.
  assert.ok(full.pages.every((p) => Object.hasOwn(full.types, p.type)));
  // Every ref in the template resolves to a page id, not a dangling title.
  const ids = new Set<string>(full.pages.map((p) => p.id));
  for (const page of full.pages) {
    for (const field of full.types[page.type]?.fields ?? []) {
      const value: string | undefined = page.fields[field.key];
      if (field.kind === 'ref' && value) assert.ok(ids.has(value), `ref to ${value}`);
    }
  }
});
