import assert from 'node:assert/strict';
import test from 'node:test';
import type { Doc } from '../state/types';
import { knownWords, projectVocabulary } from './dictionary';
import { starterSchema } from '../state/defaults';

function doc(): Doc {
  const schema = starterSchema();
  schema.calendar.months = [{ name: 'Frostwane', days: 30 }];
  schema.calendar.weekdays = ['Sunsday'];
  schema.calendar.moons = [{ id: 'm', name: 'Ember', cycle: 29.5, newMoonOn: 0, color: '#fff' }];
  return {
    projects: [{ id: 'p1', name: 'Ashfell', system: 'TTRPG', accent: '#fff' }],
    areas: [{ id: 'a1', projectId: 'p1', name: 'Keeps', defaultType: 'location' }],
    boards: [{ id: 'b1', projectId: 'p1', areaId: 'a1', name: 'Dawnguard' }],
    pages: [
      {
        id: 'g1', projectId: 'p1', boardId: 'b1', type: 'npc', title: 'Cassiel Vane',
        x: 0, y: 0, w: 244, h: 116, fields: {}, custom: null, cols: 0, body: '',
        images: [], header: null, updated: 0,
      },
    ],
    edges: [],
    schemas: { p1: schema },
  };
}

test('harvests the names the project already uses', () => {
  const words = projectVocabulary(doc(), 'p1');
  for (const word of ['Ashfell', 'Keeps', 'Dawnguard', 'Cassiel', 'Vane', 'Frostwane', 'Sunsday', 'Ember']) {
    assert.ok(words.includes(word), `expected ${word}`);
  }
});

test('another project’s names are not in this one’s vocabulary', () => {
  const d = doc();
  d.projects.push({ id: 'p2', name: 'Marrowdeep', system: '', accent: '#fff' });
  d.pages.push({ ...d.pages[0]!, id: 'g2', projectId: 'p2', title: 'Ulgrath' });
  assert.ok(!projectVocabulary(d, 'p1').includes('Ulgrath'));
  assert.ok(projectVocabulary(d, 'p2').includes('Ulgrath'));
});

test('a word is listed once however many things are named after it', () => {
  const d = doc();
  d.boards.push({ id: 'b2', projectId: 'p1', areaId: 'a1', name: 'Dawnguard' });
  const count = projectVocabulary(d, 'p1').filter((w) => w === 'Dawnguard').length;
  assert.equal(count, 1);
});

test('added words join the harvest without duplicating it', () => {
  const words = knownWords(doc(), 'p1', ['Vane', 'Thrym']);
  assert.equal(words.filter((w) => w === 'Vane').length, 1);
  assert.ok(words.includes('Thrym'));
});
