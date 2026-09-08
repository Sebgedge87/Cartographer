import assert from 'node:assert/strict';
import test from 'node:test';
import { ago, matchPage, parseQuery } from './search';
import type { Field, Page } from '../state/types';

const page = (patch: Partial<Page>): Page => ({
  id: 'p1', projectId: 'pr1', boardId: 'b1', type: 'note', title: 'Untitled',
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0, body: '',
  tags: [], images: [], header: null, updated: 0, ...patch,
});
const fields: Field[] = [
  { key: 'hp', label: 'Hit points', kind: 'number' },
  { key: 'notes', label: 'Notes', kind: 'long' },
];

test('a title match is found and ranked first', () => {
  const m = matchPage(page({ title: 'Ashen Gate', body: 'ashen' }), 'ashen', fields);
  assert.equal(m?.where, 'title');
  assert.equal(m?.excerpt!.hit, 'Ashen');
});

test('the body is searched, which it never used to be', () => {
  const m = matchPage(page({ body: 'The road runs past the Ashen Gate at dusk.' }), 'ashen gate', fields);
  assert.equal(m?.where, 'body');
  assert.equal(m?.excerpt!.hit, 'Ashen Gate');
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
  assert.equal(m?.excerpt!.hit, 'ASHEN');
});

test('a long body is trimmed either side and marked as trimmed', () => {
  const body = `${'x'.repeat(200)} Ashen ${'y'.repeat(200)}`;
  const m = matchPage(page({ body }), 'ashen', fields);
  assert.ok(m!.excerpt!.before.startsWith('…'));
  assert.ok(m!.excerpt!.after.endsWith('…'));
  assert.ok(m!.excerpt!.before.length < 40);
});

test('a short body is not marked as trimmed', () => {
  const m = matchPage(page({ body: 'By the Ashen Gate' }), 'ashen', fields);
  assert.ok(!m!.excerpt!.before.startsWith('…'));
  assert.ok(!m!.excerpt!.after.endsWith('…'));
});

test('newlines do not break the excerpt onto several lines', () => {
  const m = matchPage(page({ body: 'One\nTwo\nAshen\nFour' }), 'ashen', fields);
  assert.ok(!`${m!.excerpt!.before}${m!.excerpt!.hit}${m!.excerpt!.after}`.includes('\n'));
  assert.equal(m!.excerpt!.hit, 'Ashen');
});

test('tags are searchable', () => {
  const m = matchPage(page({ tags: ['Merchant Guild'] }), 'guild', fields);
  assert.equal(m?.where, 'tag');
  assert.equal(m?.excerpt!.hit, 'Guild');
});

test('a tag is preferred over a field and the body', () => {
  const m = matchPage(page({ tags: ['Guild'], fields: { notes: 'Guild' }, body: 'Guild' }), 'guild', fields);
  assert.equal(m?.where, 'tag');
});

test('a leading hash searches tags only', () => {
  assert.equal(matchPage(page({ body: 'Guild business' }), '#guild', fields), null);
  assert.equal(matchPage(page({ tags: ['Guild'] }), '#guild', fields)?.where, 'tag');
});

test('a bare hash matches nothing rather than every tagged page', () => {
  assert.equal(matchPage(page({ tags: ['Guild'] }), '#', fields), null);
});

test('the is: filters are recognised, case regardless', () => {
  assert.deepEqual(parseQuery('is:orphan'), { kind: 'orphan' });
  assert.deepEqual(parseQuery('IS:Recent'), { kind: 'recent' });
});

test('anything else is a text query, and empty is nothing', () => {
  assert.deepEqual(parseQuery('  ashen '), { kind: 'text', text: 'ashen' });
  assert.equal(parseQuery('   '), null);
});

test('a query that merely contains is:orphan is still text', () => {
  assert.deepEqual(parseQuery('is:orphan gate'), { kind: 'text', text: 'is:orphan gate' });
});

test('elapsed time reads the way someone would say it', () => {
  const now = 1_000_000_000_000;
  assert.equal(ago(now, now), 'just now');
  assert.equal(ago(now - 20 * 60_000, now), '20 minutes ago');
  assert.equal(ago(now - 60 * 60_000, now), '1 hour ago');
  assert.equal(ago(now - 5 * 60 * 60_000, now), '5 hours ago');
  assert.equal(ago(now - 26 * 60 * 60_000, now), '1 day ago');
  assert.equal(ago(now - 3 * 24 * 60 * 60_000, now), '3 days ago');
});

test('a clock skewed into the future does not read as negative', () => {
  assert.equal(ago(2_000, 1_000), 'just now');
});

test('a field with no value on this page is skipped', () => {
  const m = matchPage(page({ fields: { hp: '' }, body: 'Ashen' }), 'ashen', fields);
  assert.equal(m?.where, 'body');
});
