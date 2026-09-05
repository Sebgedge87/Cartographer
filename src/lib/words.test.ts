import assert from 'node:assert/strict';
import test from 'node:test';
import { scanWords, wordsIn } from './words';

const words = (text: string) => scanWords(text).map((w) => w.word);

test('finds plain prose, and where it is', () => {
  assert.deepEqual(scanWords('the wide sea'), [
    { word: 'the', start: 0, end: 3 },
    { word: 'wide', start: 4, end: 8 },
    { word: 'sea', start: 9, end: 12 },
  ]);
});

test('keeps apostrophes inside a word and drops them off the end', () => {
  assert.deepEqual(words("don't touch the '90s"), ['don\'t', 'touch', 'the']);
  assert.deepEqual(words('Cassiel’s blade'), ['Cassiel’s', 'blade']);
});

test('skips code, fenced and inline', () => {
  assert.deepEqual(words('before ```\nnotaword\n``` after'), ['before', 'after']);
  assert.deepEqual(words('use `npmm` here'), ['use', 'here']);
  // An unterminated fence swallows the rest: it is a fence in the preview too.
  assert.deepEqual(words('start ```\nnotaword'), ['start']);
});

test('skips the app’s own inline grammar', () => {
  assert.deepEqual(words('see [[Dawnguard Keep]] tonight'), ['see', 'tonight']);
  assert.deepEqual(words('block ![[Cassiel Vane]] here'), ['block', 'here']);
  assert.deepEqual(words('hits @Cassiel.hp hard'), ['hits', 'hard']);
  assert.deepEqual(words('line @@Cassiel Vane'), ['line']);
  assert.deepEqual(words('roll 2d6+3 now'), ['roll', 'now']);
  assert.deepEqual(words('roll d20 now'), ['roll', 'now']);
  assert.deepEqual(words('> [!gm] hidden'), ['hidden']);
});

test('checks link text but not link targets', () => {
  assert.deepEqual(words('[the keep](https://exampl.com/qq)'), ['the', 'keep']);
  assert.deepEqual(words('![a banner](asset:ab12cd)'), ['banner']);
  assert.deepEqual(words('bare https://exampl.com/zz end'), ['bare', 'end']);
});

test('leaves anything touching a digit alone', () => {
  assert.deepEqual(words('the 2nd time, x3 over'), ['the', 'time', 'over']);
});

test('leaves capitals and single letters alone', () => {
  assert.deepEqual(words('HP and AC, a rule'), ['and', 'rule']);
});

test('markdown punctuation is not a word', () => {
  assert.deepEqual(words('## A **bold** claim\n\n- one\n- two'), ['bold', 'claim', 'one', 'two']);
});

test('wordsIn pulls the inventions out of a title', () => {
  assert.deepEqual(wordsIn('Dawnguard Keep (Ruined)'), ['Dawnguard', 'Keep', 'Ruined']);
});
