import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveFields, labelledFields, mapFieldValues, resolveFieldKey } from './fields.js';
import type { BlockType, Field, PageRow } from './rows.js';

const fields: Field[] = [
  { key: 'hp', label: 'Hit points', kind: 'number' },
  { key: 'f3k9x', label: 'Allegiance', kind: 'select', options: ['Loyal', 'Hostile'] },
  { key: 'sec', label: 'Statistics', kind: 'heading' },
];
const type: BlockType = { label: 'Creature', code: 'CRE', color: '#a00', fields };
const page = (patch: Partial<PageRow> = {}): PageRow => ({
  id: 'p1', project_id: 'pr1', board_id: 'b1', type: 'creature', title: 'Warband',
  x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0, body: '',
  tags: [], images: [], header: null, updated: 0, ...patch,
});

test('a page with no layout of its own follows its block type', () => {
  assert.deepEqual(effectiveFields(page(), type), fields);
});

test('a page with its own layout ignores the block type', () => {
  const own: Field[] = [{ key: 'z', label: 'Only', kind: 'text' }];
  assert.deepEqual(effectiveFields(page({ custom: own }), type), own);
});

test('an empty custom layout is not the same as having none', () => {
  assert.deepEqual(effectiveFields(page({ custom: [] }), type), []);
});

test('a field can be named by its key', () => {
  assert.equal(resolveFieldKey(fields, 'hp'), 'hp');
});

test('a field can be named by its label, which is what anyone would say', () => {
  assert.equal(resolveFieldKey(fields, 'Hit points'), 'hp');
  assert.equal(resolveFieldKey(fields, '  hit POINTS '), 'hp');
});

test('a name matching nothing resolves to nothing rather than inventing a key', () => {
  assert.equal(resolveFieldKey(fields, 'Charisma'), null);
});

test('keys win over labels when the two collide', () => {
  const clash: Field[] = [
    { key: 'speed', label: 'Pace', kind: 'number' },
    { key: 'other', label: 'speed', kind: 'text' },
  ];
  assert.equal(resolveFieldKey(clash, 'speed'), 'speed');
});

test('values come back under labels, skipping headings and blanks', () => {
  const p = page({ fields: { hp: '31', f3k9x: '', sec: 'x' } });
  assert.deepEqual(labelledFields(p, type), { 'Hit points': '31' });
});

test('writing by label maps onto the stored keys', () => {
  const r = mapFieldValues(fields, { 'Hit points': '12', Allegiance: 'Loyal' });
  assert.deepEqual(r.values, { hp: '12', f3k9x: 'Loyal' });
  assert.deepEqual(r.unknown, []);
});

test('a field that does not exist is reported, not written into the void', () => {
  const r = mapFieldValues(fields, { Charisma: '9' });
  assert.deepEqual(r.values, {});
  assert.deepEqual(r.unknown, ['Charisma']);
});
