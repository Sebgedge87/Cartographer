import assert from 'node:assert/strict';
import test from 'node:test';
import type { Edge, Page } from './types';
import { arrangeLayout } from './graph';

const page = (id: string, title = id, type = 'note'): Page => ({
  id, projectId: 'p1', boardId: 'b1', type, title,
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0,
  body: '', images: [], header: null, updated: 0,
});
const link = (from: string, to: string): Edge => ({ id: `${from}-${to}`, from, to, kind: 'manual' });
const lay = (pages: Page[], edges: Edge[]) => arrangeLayout(pages, edges, () => 0);
/** Row index, counting from the top of the layout. */
const rows = (at: Map<string, { x: number; y: number }>) => {
  const ys = [...new Set([...at.values()].map((p) => p.y))].sort((a, b) => a - b);
  return (id: string) => ys.indexOf(at.get(id)!.y);
};

test('a hub sits above the things linked to it', () => {
  const pages = ['keep', 'hall', 'yard', 'well'].map((id) => page(id));
  const at = lay(pages, [link('keep', 'hall'), link('keep', 'yard'), link('keep', 'well')]);
  const row = rows(at);
  assert.equal(row('keep'), 0);
  assert.deepEqual([row('hall'), row('yard'), row('well')], [1, 1, 1]);
});

test('the hierarchy cascades: a child’s own links go below it again', () => {
  const pages = ['region', 'city', 'district', 'inn'].map((id) => page(id));
  const at = lay(pages, [link('region', 'city'), link('city', 'district'), link('district', 'inn')]);
  const row = rows(at);
  assert.deepEqual([row('region'), row('city'), row('district'), row('inn')], [0, 1, 2, 3]);
});

test('a parent is centred over its children', () => {
  const pages = ['keep', 'a', 'b'].map((id) => page(id));
  const at = lay(pages, [link('keep', 'a'), link('keep', 'b')]);
  const mid = (at.get('a')!.x + at.get('b')!.x) / 2;
  assert.equal(at.get('keep')!.x, Math.round(mid));
});

test('separate trees stand side by side, not on top of each other', () => {
  const pages = ['a', 'b', 'c', 'd'].map((id) => page(id));
  const at = lay(pages, [link('a', 'b'), link('c', 'd')]);
  // A parent over a single child shares its column, so the test is that the two
  // trees occupy different columns — not that all four cards do.
  assert.equal(at.get('a')!.x, at.get('b')!.x);
  assert.equal(at.get('c')!.x, at.get('d')!.x);
  assert.notEqual(at.get('a')!.x, at.get('c')!.x);
  assert.equal(rows(at)('a'), 0);
  assert.equal(rows(at)('c'), 0);
});

test('unlinked pages are packed below rather than strung out in a row', () => {
  const pages = ['hub', 'kid', ...Array.from({ length: 9 }, (_, i) => `n${i}`)].map((id) => page(id));
  const at = lay(pages, [link('hub', 'kid')]);
  const loose = Array.from({ length: 9 }, (_, i) => at.get(`n${i}`)!);
  // Below the tree, and in more than one row.
  assert.ok(loose.every((p) => p.y > at.get('kid')!.y));
  assert.ok(new Set(loose.map((p) => p.y)).size > 1);
});

test('a childless page stays with its siblings, not pushed past their children', () => {
  //          keep
  //        /  |   \
  //     yard hall  well        — hall has children, yard and well do not
  //           |  \
  //        pantry cellar
  const pages = ['keep', 'hall', 'yard', 'well', 'pantry', 'cellar'].map((id) => page(id));
  const at = lay(pages, [
    link('keep', 'hall'), link('keep', 'yard'), link('keep', 'well'),
    link('hall', 'pantry'), link('hall', 'cellar'),
  ]);
  // hall sits centred over its own two children, so it is not evenly spaced from
  // the others — that is the hierarchy. What matters is that the two childless
  // siblings are side by side rather than stranded past hall's grandchildren.
  const gap = Math.abs(at.get('well')!.x - at.get('yard')!.x);
  const pitch = Math.abs(at.get('cellar')!.x - at.get('pantry')!.x);
  assert.equal(gap, pitch);
  assert.ok(at.get('yard')!.x > at.get('cellar')!.x);
});

test('links to pages on another board are ignored', () => {
  const at = lay([page('a'), page('b')], [link('a', 'elsewhere'), link('b', 'elsewhere')]);
  assert.equal(rows(at)('a'), 0);
  assert.equal(rows(at)('b'), 0);
});

test('the same board lays out the same way whatever order it arrives in', () => {
  const pages = ['a', 'b', 'c', 'd', 'e'].map((id) => page(id));
  const edges = [link('a', 'b'), link('b', 'c'), link('d', 'e')];
  const first = lay(pages, edges);
  const shuffled = [pages[3]!, pages[0]!, pages[4]!, pages[2]!, pages[1]!];
  const second = lay(shuffled, edges);
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    assert.deepEqual(second.get(id), first.get(id), id);
  }
});

test('every page is placed exactly once, and none share a spot', () => {
  const pages = Array.from({ length: 30 }, (_, i) => page(`n${i}`));
  const edges = Array.from({ length: 20 }, (_, i) => link(`n${i}`, `n${(i * 7 + 3) % 30}`));
  const at = lay(pages, edges);
  assert.equal(at.size, 30);
  assert.equal(new Set([...at.values()].map((p) => `${p.x},${p.y}`)).size, 30);
});
