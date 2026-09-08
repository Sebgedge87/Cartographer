import assert from 'node:assert/strict';
import test from 'node:test';
import { diffTable, rowKey } from './diff';

const key = (row: Record<string, unknown> & { id: string }) => rowKey(row);

test('a row that has not changed is not pending', () => {
  const rows = [{ id: 'a', title: 'Keep', updated: 0 }];
  const baseline = new Map(rows.map((r) => [r.id, key(r)]));
  const d = diffTable(baseline, rows);
  assert.equal(d.changed.length, 0);
  assert.equal(d.gone.length, 0);
});

test('only the timestamp moving is not a change', () => {
  const baseline = new Map([['a', key({ id: 'a', title: 'Keep', updated: 0 })]]);
  const d = diffTable(baseline, [{ id: 'a', title: 'Keep', updated: 1_700_000_000 }]);
  assert.equal(d.changed.length, 0, 'a fresh stamp must not count as an edit');
});

test('an edited row is pending', () => {
  const baseline = new Map([['a', key({ id: 'a', title: 'Keep', updated: 0 })]]);
  const d = diffTable(baseline, [{ id: 'a', title: 'Changed', updated: 0 }]);
  assert.deepEqual(d.changed.map((r) => r.id), ['a']);
});

test('a new row is pending and a removed one is a delete', () => {
  const baseline = new Map([['a', key({ id: 'a', updated: 0 })]]);
  const d = diffTable(baseline, [{ id: 'b', updated: 0 }]);
  assert.deepEqual(d.changed.map((r) => r.id), ['b']);
  assert.deepEqual(d.gone, ['a']);
});

test('the next baseline describes the document, not the server', () => {
  const baseline = new Map([['a', key({ id: 'a', updated: 0 })]]);
  const d = diffTable(baseline, [{ id: 'b', updated: 0 }, { id: 'c', updated: 0 }]);
  assert.deepEqual([...d.next.keys()], ['b', 'c']);
});
