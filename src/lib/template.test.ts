import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProjectFile } from './io';
import { templateProject } from './template';

/**
 * The template is only worth shipping if it imports. These run it through the same
 * parser the app uses, so a field renamed on one side fails here rather than in
 * someone's hands.
 */
const imported = () => {
  const parsed = parseProjectFile(JSON.stringify(templateProject()));
  assert.ok(parsed, 'the template did not parse');
  return parsed;
};

test('the template parses as a project file', () => {
  assert.equal(imported().project.name, 'The Ashen Reach');
});

test('every page survives, on a real board', () => {
  const file = imported();
  assert.equal(file.pages.length, 3);
  const boards = new Set(file.boards.map((b) => b.id));
  for (const page of file.pages) assert.ok(boards.has(page.boardId), `${page.title} is off its board`);
});

test('every board sits in a real area', () => {
  const file = imported();
  const areas = new Set(file.areas.map((a) => a.id));
  for (const board of file.boards) assert.ok(areas.has(board.areaId), `${board.name} is off its area`);
});

test('every page uses a block type the file defines', () => {
  const file = imported();
  for (const page of file.pages) assert.ok(file.types[page.type], `${page.title} has no type`);
});

test('field values name fields that exist on their type', () => {
  const file = imported();
  for (const page of file.pages) {
    const keys = new Set((file.types[page.type]?.fields ?? []).map((f) => f.key));
    for (const key of Object.keys(page.fields)) {
      assert.ok(keys.has(key), `${page.title} sets "${key}", which its type does not define`);
    }
  }
});

test('a ref field points at a page that is in the file', () => {
  const file = imported();
  const mara = file.pages.find((p) => p.title === 'Mara Vell');
  const home = mara?.fields['home'];
  assert.ok(file.pages.some((p) => p.id === home), `home points at "${home}", which is nothing`);
});

test('tags come through, since the example is what teaches them', () => {
  const file = imported();
  const tagged = file.pages.filter((p) => p.tags.length > 0);
  assert.ok(tagged.length >= 2);
  assert.ok(tagged.some((p) => p.tags.includes('Merchant Guild')));
});

test('the select fields carry their choices, and values are among them', () => {
  const file = imported();
  for (const type of Object.values(file.types)) {
    for (const field of type.fields) {
      if (field.kind !== 'select') continue;
      assert.ok(field.options?.length, `${field.label} offers no choices`);
      for (const page of file.pages) {
        const value = page.fields[field.key];
        if (value) assert.ok(field.options.includes(value), `"${value}" is not a choice for ${field.label}`);
      }
    }
  }
});

test('hand-drawn links join pages that exist', () => {
  const file = imported();
  const ids = new Set(file.pages.map((p) => p.id));
  assert.ok(file.links.length > 0);
  for (const link of file.links) {
    assert.ok(ids.has(link.from) && ids.has(link.to), 'a link dangles');
  }
});

test('a [[wikilink]] in a body names a real page', () => {
  const file = imported();
  const titles = new Set(file.pages.map((p) => p.title.toLowerCase()));
  for (const page of file.pages) {
    for (const m of page.body.matchAll(/\[\[([^\]]+)\]\]/g)) {
      assert.ok(titles.has(m[1]!.trim().toLowerCase()), `[[${m[1]}]] names no page`);
    }
  }
});

test('pages are laid out even though the file gives no coordinates', () => {
  // Whatever the importer decides, no two pages may land on the same spot.
  const file = imported();
  const spots = file.pages.map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(spots).size, spots.length, 'two pages share a position');
});
