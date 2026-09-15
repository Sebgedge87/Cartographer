import assert from 'node:assert/strict';
import test from 'node:test';
import { REAP_AFTER_MS, reapable } from './reap';

const NOW = 1_700_000_000_000;
const old = NOW - REAP_AFTER_MS - 1;
const fresh = NOW - 60_000;

test('a referenced object is never reaped, however old', () => {
  assert.deepEqual(reapable(new Map([['a', old]]), new Set(['a']), NOW), []);
});

test('an unreferenced object past the grace window is reaped', () => {
  assert.deepEqual(reapable(new Map([['a', old]]), new Set(), NOW), ['a']);
});

test('a freshly uploaded object is left alone even when unreferenced', () => {
  // The document that references it may simply not have been pushed yet.
  assert.deepEqual(reapable(new Map([['a', fresh]]), new Set(), NOW), []);
});

test('an object exactly at the boundary is not yet reaped', () => {
  assert.deepEqual(reapable(new Map([['a', NOW - REAP_AFTER_MS]]), new Set(), NOW), []);
});

test('only the dead are named out of a mixed bucket', () => {
  const remote = new Map([['keep', old], ['dead', old], ['new', fresh]]);
  assert.deepEqual(reapable(remote, new Set(['keep']), NOW), ['dead']);
});

test('an empty bucket reaps nothing', () => {
  assert.deepEqual(reapable(new Map(), new Set(['a']), NOW), []);
});

test('a clock behind the server treats objects as new, not as dead', () => {
  // created_at in the future gives a negative age, which must not read as old.
  assert.deepEqual(reapable(new Map([['a', NOW + 86_400_000]]), new Set(), NOW), []);
});
