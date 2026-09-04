import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Doc, Edge, Page } from '../types';
import { starterCalendar } from '../defaults';
import { mergeDoc, type MergeMeta, type RemoteStamps } from './merge';

const schema = {
  types: { note: { label: 'Note', code: 'NT', color: '#8a919e', fields: [] } },
  typeOrder: ['note'],
  calendar: starterCalendar(),
};

const page = (id: string, title: string, extra: Partial<Page> = {}): Page => ({
  id, projectId: 'p1', boardId: 'bd1', type: 'note', title,
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0,
  body: '', images: [], header: null, updated: 0, ...extra,
});

const doc = (pages: Page[], edges: Edge[] = []): Doc => ({
  projects: [{ id: 'p1', name: 'Veil', system: '', accent: '#e0a44a' }],
  areas: [{ id: 'a1', projectId: 'p1', name: 'Lore', defaultType: 'note' }],
  boards: [{ id: 'bd1', projectId: 'p1', areaId: 'a1', name: 'First board' }],
  pages, edges, schemas: { p1: schema },
});

const meta = (syncedPages: string[] = [], touched: Record<string, number> = {}): MergeMeta => ({
  syncedIds: { projects: ['p1'], areas: ['a1'], boards: ['bd1'], pages: syncedPages, edges: [] },
  touchedAt: { projects: {}, areas: {}, boards: {}, pages: touched, edges: {} },
});

const stamps = (pages: Record<string, number> = {}): RemoteStamps => ({
  projects: new Map([['p1', 0]]),
  areas: new Map([['a1', 0]]),
  boards: new Map([['bd1', 0]]),
  pages: new Map(Object.entries(pages)),
  edges: new Map(),
});

const titles = (d: Doc) => d.pages.map((p) => p.title).sort();

test('remote wins when it changed more recently', () => {
  const out = mergeDoc(doc([page('g1', 'LOCAL')]), doc([page('g1', 'REMOTE')]),
    stamps({ g1: 200 }), meta(['g1'], { g1: 100 }));
  assert.deepEqual(titles(out), ['REMOTE']);
});

test('local wins when this machine changed it more recently', () => {
  const out = mergeDoc(doc([page('g1', 'LOCAL')]), doc([page('g1', 'REMOTE')]),
    stamps({ g1: 200 }), meta(['g1'], { g1: 300 }));
  assert.deepEqual(titles(out), ['LOCAL']);
});

test('a row only the server has is adopted', () => {
  const out = mergeDoc(doc([]), doc([page('g2', 'FROM OTHER MACHINE')]), stamps({ g2: 5 }), meta([]));
  assert.deepEqual(titles(out), ['FROM OTHER MACHINE']);
});

test('a row the server had and no longer has was deleted elsewhere', () => {
  const out = mergeDoc(doc([page('g1', 'DOOMED')]), doc([]), stamps(), meta(['g1']));
  assert.deepEqual(titles(out), []);
});

test('a row the server never had is simply unpushed, and survives', () => {
  const out = mergeDoc(doc([page('g9', 'BRAND NEW')]), doc([]), stamps(), meta([]));
  assert.deepEqual(titles(out), ['BRAND NEW']);
});

test('a page whose board is gone is dropped rather than orphaned', () => {
  const out = mergeDoc(doc([page('g3', 'ORPHAN', { boardId: 'gone' })]), doc([]), stamps(), meta([]));
  assert.deepEqual(titles(out), []);
});

test('a board whose area is gone takes its pages with it', () => {
  const local = doc([page('g4', 'ON A LOST BOARD', { boardId: 'bd9' })]);
  local.boards = [...local.boards, { id: 'bd9', projectId: 'p1', areaId: 'gone', name: 'Stray' }];
  const out = mergeDoc(local, doc([]), stamps(), meta([]));
  assert.deepEqual(out.boards.map((b) => b.id), ['bd1']);
  assert.deepEqual(titles(out), []);
});

test('manual edges survive and derived edges are rebuilt', () => {
  const local = doc(
    [page('g1', 'A', { body: 'see [[B]]' }), page('g2', 'B')],
    [
      { id: 'm:g1:g2', from: 'g1', to: 'g2', kind: 'manual' },
      // a stale derived edge that should not survive verbatim
      { id: 'w:stale', from: 'g1', to: 'g2', kind: 'wiki' },
    ],
  );
  const out = mergeDoc(local, doc([]), stamps(), meta([]));
  assert.deepEqual(out.edges.filter((e) => e.kind === 'manual').map((e) => e.id), ['m:g1:g2']);
  assert.deepEqual(out.edges.filter((e) => e.kind === 'wiki').map((e) => e.id), ['w:g1:g2']);
});

test('an edge pointing at a missing page is dropped', () => {
  const local = doc([page('g1', 'A')], [{ id: 'm:g1:gone', from: 'g1', to: 'gone', kind: 'manual' }]);
  assert.deepEqual(mergeDoc(local, doc([]), stamps(), meta([])).edges, []);
});
