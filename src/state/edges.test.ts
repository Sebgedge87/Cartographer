import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from './types';
import { edgePath } from './graph';

const card = (id: string, x: number, y: number): Page => ({
  id, projectId: 'p1', boardId: 'b1', type: 'note', title: id,
  x, y, w: 244, h: 116, fields: {}, custom: null, cols: 0,
  body: '', tags: [], images: [], header: null, updated: 0,
});

/**
 * How far the drawn curve strays from the straight line between its endpoints, in
 * pixels. Zero is a ruled line; the bigger it is, the more the link bows.
 */
function bow(path: string): number {
  const n = path.match(/-?[\d.]+/g)!.map(Number);
  const [sx, sy, c1x, c1y, c2x, c2y, ex, ey] = n as [number, number, number, number, number, number, number, number];
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 1) return 0;
  const off = (px: number, py: number) => Math.abs((px - sx) * dy - (py - sy) * dx) / len;
  return Math.max(off(c1x, c1y), off(c2x, c2y));
}

test('a card squarely beside another is joined by a straight line', () => {
  assert.ok(bow(edgePath(card('a', 0, 0), card('b', 600, 0), 'seed')) < 0.5);
});

test('a card squarely above another is joined by a straight line', () => {
  assert.ok(bow(edgePath(card('a', 0, 0), card('b', 0, 600), 'seed')) < 0.5);
});

test('a diagonal link bows', () => {
  assert.ok(bow(edgePath(card('a', 0, 0), card('b', 500, 500), 'seed')) > 20);
});

test('the curve grows as a card is pulled out of line', () => {
  // Same pair, the second card drifting further off the axis each step.
  const bows = [0, 60, 140, 260, 420].map((dy) =>
    bow(edgePath(card('a', 0, 0), card('b', 700, dy), 'seed')));
  for (let i = 1; i < bows.length; i++) {
    assert.ok(bows[i]! >= bows[i - 1]!, `step ${i}: ${bows[i - 1]} -> ${bows[i]}`);
  }
  assert.ok(bows[0]! < 0.5, 'starts straight');
  assert.ok(bows[bows.length - 1]! > 20, 'ends curved');
});

test('it changes smoothly, with no jump between one pixel and the next', () => {
  let previous = bow(edgePath(card('a', 0, 0), card('b', 700, 0), 'seed'));
  let biggest = 0;
  for (let dy = 1; dy <= 400; dy++) {
    const next = bow(edgePath(card('a', 0, 0), card('b', 700, dy), 'seed'));
    biggest = Math.max(biggest, Math.abs(next - previous));
    previous = next;
  }
  // A pixel of movement must never move the belly of the curve by more than one.
  assert.ok(biggest < 1, `largest single-pixel jump was ${biggest}`);
});

test('two cards on top of each other still produce a drawable path', () => {
  const path = edgePath(card('a', 100, 100), card('b', 100, 100), 'seed');
  assert.ok(/^M[-\d. ]+L[-\d. ]+$/.test(path), path);
});

test('the same pair always draws the same path', () => {
  const one = edgePath(card('a', 0, 0), card('b', 500, 380), 'a:b');
  const two = edgePath(card('a', 0, 0), card('b', 500, 380), 'a:b');
  assert.equal(one, two);
});
