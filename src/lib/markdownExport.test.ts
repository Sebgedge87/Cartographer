import assert from 'node:assert/strict';
import test from 'node:test';
import { projectToMarkdown } from './markdownExport';
import type { Doc, Page } from '../state/types';
import { starterSchema } from '../state/defaults';

const page = (patch: Partial<Page>): Page => ({
  id: 'p1', projectId: 'pr1', boardId: 'b1', type: 'creature', title: 'Untitled',
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0, body: '',
  tags: [], images: [], header: null, updated: 0, ...patch,
});

const doc = (pages: Page[]): Doc => ({
  projects: [{ id: 'pr1', name: 'The North', system: 'Homebrew', accent: '#fff' }],
  areas: [{ id: 'a1', projectId: 'pr1', name: 'Locations', defaultType: 'creature' }],
  boards: [{ id: 'b1', projectId: 'pr1', areaId: 'a1', name: 'The Reach' }],
  pages,
  edges: [],
  schemas: {
    pr1: {
      ...starterSchema(),
      types: {
        creature: {
          label: 'Creature', code: 'CRE', color: '#a00',
          fields: [
            { key: 'hp', label: 'Hit points', kind: 'number' },
            { key: 'ally', label: 'Ally', kind: 'ref' },
            { key: 'note', label: 'Note', kind: 'text' },
          ],
        },
      },
      typeOrder: ['creature'],
      dictionary: [],
    },
  },
});

test('the tree becomes the document structure', () => {
  const md = projectToMarkdown(doc([page({ title: 'Watchtower' })]), 'pr1')!;
  assert.match(md, /^# The North/);
  assert.match(md, /## Locations/);
  assert.match(md, /### The Reach/);
  assert.match(md, /#### Watchtower/);
});

test('field values become a table, and empty ones are left out', () => {
  const md = projectToMarkdown(doc([page({ fields: { hp: '12', note: '' } })]), 'pr1')!;
  assert.match(md, /\| Hit points \| 12 \|/);
  assert.doesNotMatch(md, /\| Note \|/);
});

test('a link field prints the page it points at, not its id', () => {
  const pages = [page({ id: 'p1', title: 'Rider', fields: { ally: 'p2' } }), page({ id: 'p2', title: 'Watchtower' })];
  const md = projectToMarkdown(doc(pages), 'pr1')!;
  assert.match(md, /\| Ally \| Watchtower \|/);
});

test('a pipe in a value cannot break the table', () => {
  const md = projectToMarkdown(doc([page({ fields: { note: 'a | b' } })]), 'pr1')!;
  assert.match(md, /\| Note \| a \\\| b \|/);
});

test('the body is copied as written', () => {
  const md = projectToMarkdown(doc([page({ body: 'Cold, and [[Watchtower]] watches.' })]), 'pr1')!;
  assert.match(md, /Cold, and \[\[Watchtower\]\] watches\./);
});

test('an inline stat line becomes the page name', () => {
  const pages = [page({ id: 'p1', title: 'Rider', body: '@@Watchtower stands guard.' }), page({ id: 'p2', title: 'Watchtower' })];
  const md = projectToMarkdown(doc(pages), 'pr1')!;
  assert.match(md, /\*\*Watchtower\*\* stands guard\./);
});

test('a field reference becomes its value', () => {
  const pages = [
    page({ id: 'p1', title: 'Rider', body: 'It has @Watchtower.hp left.' }),
    page({ id: 'p2', title: 'Watchtower', fields: { hp: '31' } }),
  ];
  const md = projectToMarkdown(doc(pages), 'pr1')!;
  assert.match(md, /It has \*\*31\*\* left\./);
});

test('a reference to a page that is gone is left visible', () => {
  const md = projectToMarkdown(doc([page({ body: 'It has @Nowhere.hp left.' })]), 'pr1')!;
  assert.match(md, /@Nowhere\.hp/);
});

test('pages come out in reading order down the board', () => {
  const pages = [
    page({ id: 'p1', title: 'Lower', y: 400 }),
    page({ id: 'p2', title: 'Upper', y: 100 }),
  ];
  const md = projectToMarkdown(doc(pages), 'pr1')!;
  assert.ok(md.indexOf('Upper') < md.indexOf('Lower'));
});

test('an empty board says so rather than vanishing', () => {
  assert.match(projectToMarkdown(doc([]), 'pr1')!, /No pages\./);
});

test('the system is a subtitle when it is really set', () => {
  assert.match(projectToMarkdown(doc([]), 'pr1')!, /\*Homebrew\*/);
});

test('the placeholder system is not printed as a subtitle', () => {
  const d = doc([]);
  d.projects[0]!.system = 'Untitled';
  assert.doesNotMatch(projectToMarkdown(d, 'pr1')!, /\*Untitled\*/);
});

test('tags travel with the page', () => {
  const md = projectToMarkdown(doc([page({ tags: ['Merchant Guild', 'Coastal'] })]), 'pr1')!;
  assert.match(md, /`#Merchant Guild` `#Coastal`/);
});

test('a page with no tags gains no empty line for them', () => {
  const md = projectToMarkdown(doc([page({ tags: [] })]), 'pr1')!;
  assert.doesNotMatch(md, /`#/);
});

test('an unknown project is null, not an empty document', () => {
  assert.equal(projectToMarkdown(doc([]), 'nope'), null);
});
