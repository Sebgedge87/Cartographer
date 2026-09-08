import assert from 'node:assert/strict';
import test from 'node:test';
import { retitleBody } from './retitle';

const titles = (...names: string[]) => new Set(names.map((n) => n.toLowerCase()));

test('a wikilink follows the rename', () => {
  const r = retitleBody('Guarded by [[Watchtower]] at dusk.', 'Watchtower', 'North Watchtower', titles('Watchtower'));
  assert.equal(r.body, 'Guarded by [[North Watchtower]] at dusk.');
  assert.equal(r.changed, 1);
});

test('an embed keeps its bang', () => {
  const r = retitleBody('![[Watchtower]]', 'Watchtower', 'North Watchtower', titles('Watchtower'));
  assert.equal(r.body, '![[North Watchtower]]');
});

test('matching is case-insensitive and ignores padding', () => {
  const r = retitleBody('[[ watchtower ]]', 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, '[[Keep]]');
});

test('other pages are left alone', () => {
  const body = 'See [[Harbour]] and [[Watchtower]].';
  const r = retitleBody(body, 'Watchtower', 'Keep', titles('Watchtower', 'Harbour'));
  assert.equal(r.body, 'See [[Harbour]] and [[Keep]].');
  assert.equal(r.changed, 1);
});

test('every occurrence is rewritten', () => {
  const r = retitleBody('[[Watchtower]] and [[Watchtower]]', 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, '[[Keep]] and [[Keep]]');
  assert.equal(r.changed, 2);
});

test('a stat line keeps the prose that followed it', () => {
  const r = retitleBody('@@Watchtower stands guard.', 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, '@@Keep stands guard.');
  assert.equal(r.changed, 1);
});

test('a stat line resolves the longest title, not the shortest', () => {
  const set = titles('Watch', 'Watchtower Keep');
  const r = retitleBody('@@Watchtower Keep holds.', 'Watchtower Keep', 'The Keep', set);
  assert.equal(r.body, '@@The Keep holds.');
});

test('a stat line naming a different page is untouched', () => {
  const set = titles('Watch', 'Watchtower Keep');
  const r = retitleBody('@@Watchtower Keep holds.', 'Watch', 'Vigil', set);
  assert.equal(r.body, '@@Watchtower Keep holds.');
  assert.equal(r.changed, 0);
});

test('a field reference keeps its field', () => {
  const r = retitleBody('HP is @Watchtower.hp today.', 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, 'HP is @Keep.hp today.');
});

test('a title the undelimited form cannot spell is left alone and counted', () => {
  const r = retitleBody('@@Watchtower rises.', 'Watchtower', 'Keep (ruined)', titles('Watchtower'));
  assert.equal(r.body, '@@Watchtower rises.');
  assert.equal(r.changed, 0);
  assert.equal(r.skipped, 1);
});

test('a bracketed link can take any title', () => {
  const r = retitleBody('[[Watchtower]]', 'Watchtower', 'Keep (ruined)', titles('Watchtower'));
  assert.equal(r.body, '[[Keep (ruined)]]');
  assert.equal(r.skipped, 0);
});

test('code fences are documentation, not links', () => {
  const body = 'Write ```\n[[Watchtower]]\n``` to link it, as in [[Watchtower]].';
  const r = retitleBody(body, 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, 'Write ```\n[[Watchtower]]\n``` to link it, as in [[Keep]].');
  assert.equal(r.changed, 1);
});

test('inline code is left alone too', () => {
  const r = retitleBody('Type `[[Watchtower]]` here.', 'Watchtower', 'Keep', titles('Watchtower'));
  assert.equal(r.body, 'Type `[[Watchtower]]` here.');
  assert.equal(r.changed, 0);
});

test('renaming to the same title changes nothing', () => {
  const r = retitleBody('[[Watchtower]]', 'Watchtower', 'Watchtower', titles('Watchtower'));
  assert.equal(r.changed, 0);
});

test('an empty body is safe', () => {
  assert.equal(retitleBody('', 'A', 'B', titles('A')).body, '');
});
