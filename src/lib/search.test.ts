import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPage } from './search';
import type { Field, Page } from '../state/types';

const page = (patch: Partial<Page>): Page => ({
  id: 'p1', projectId: 'pr1', boardId: 'b1', type: 'note', title: 'Untitled',
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0, body: '',
  images: [], header: null, updated: 0, ...patch,
});
const fields: Field[] = [
  { key: 'hp', label: 'Hit points', kind: 'number' },
  { key: 'notes', label: 'Notes', kind: 'long' },
];

test('a title match is found and ranked first', () => {
  const m = matchPage(page({ title: 'Ashen Gate', body: 'ashen' }), 'ashen', fields);
  assert.equal(m?.where, 'title');
  assert.equal(m?.excerpt.hit, 'Ashen');
});

test('the body is searched, which it never used to be', () => {
  const m = matchPage(page({ body: 'The road runs past the Ashen Gate at dusk.' }), 'ashen gate', fields);
  assert.equal(m?.where, 'body');
  assert.equal(m?.excerpt.hit, 'Ashen Gate');
});

test('field values are searched and name their field', () => {
  const m = matchPage(page({ fields: { notes: 'Sworn to the Ashen Gate' } }), 'ashen', fields);
  assert.equal(m?.where, 'field');
  assert.equal(m?.label, 'Notes');
});

test('a field is preferred over the body', () => {
  const m = matchPage(page({ fields: { notes: 'Ashen' }, body: 'Ashen' }), 'ashen', fields);
  assert.equal(m?.where, 'field');
});

test('no match is null', () => {
  assert.equal(matchPage(page({ body: 'nothing here' }), 'ashen', fields), null);
});

test('an empty query matches nothing rather than everything', () => {
  assert.equal(matchPage(page({ title: 'Ashen Gate' }), '   ', fields), null);
});

test('the excerpt keeps the original casing of the hit', () => {
  const m = matchPage(page({ body: 'the ASHEN gate' }), 'ashen', fields);
  assert.equal(m?.excerpt.hit, 'ASHEN');
});

test('a long body is trimmed either side and marked as trimmed', () => {
  const body = `${'x'.repeat(200)} Ashen ${'y'.repeat(200)}`;
  const m = matchPage(page({ body }), 'ashen', fields);
  assert.ok(m!.excerpt.before.startsWith('…'));
  assert.ok(m!.excerpt.after.endsWith('…'));
  assert.ok(m!.excerpt.before.length < 40);
});

test('a short body is not marked as trimmed', () => {
  const m = matchPage(page({ body: 'By the Ashen Gate' }), 'ashen', fields);
  assert.ok(!m!.excerpt.before.startsWith('…'));
  assert.ok(!m!.excerpt.after.endsWith('…'));
});

test('newlines do not break the excerpt onto several lines', () => {
  const m = matchPage(page({ body: 'One\nTwo\nAshen\nFour' }), 'ashen', fields);
  assert.ok(!`${m!.excerpt.before}${m!.excerpt.hit}${m!.excerpt.after}`.includes('\n'));
  assert.equal(m!.excerpt.hit, 'Ashen');
});

test('a field with no value on this page is skipped', () => {
  const m = matchPage(page({ fields: { hp: '' }, body: 'Ashen' }), 'ashen', fields);
  assert.equal(m?.where, 'body');
});
