import type { BlockType, Doc, Field, ProjectSchema } from './types';

const f = (key: string, label: string, kind: Field['kind'] = 'text'): Field => ({ key, label, kind });
const T = (label: string, code: string, color: string, fields: Field[]): BlockType => ({ label, code, color, fields });

/**
 * The block types a new project starts with — a starting point, not a commitment.
 * Every label, field and colour here is editable per project in the schema view,
 * and types can be deleted outright, which is what keeps the app system-agnostic.
 */
export function starterTypes(): Record<string, BlockType> {
  return {
    creature: T('Creature', 'CR', '#e0684f', [f('threat', 'Threat'), f('hp', 'Vitality', 'number'), f('speed', 'Speed'), f('defence', 'Defence'), f('drive', 'Drive')]),
    npc: T('NPC', 'NP', '#d98cc0', [f('role', 'Role'), f('faction', 'Faction', 'ref'), f('attitude', 'Attitude'), f('seen_at', 'Seen at', 'ref')]),
    weapon: T('Weapon', 'WP', '#e0a44a', [f('damage', 'Damage'), f('range', 'Range'), f('hands', 'Hands', 'number'), f('traits', 'Traits')]),
    armour: T('Armour', 'AR', '#8fa5c9', [f('protection', 'Protection'), f('bulk', 'Bulk', 'number'), f('traits', 'Traits')]),
    item: T('Item', 'IT', '#66c39a', [f('rarity', 'Rarity'), f('value', 'Value'), f('effect', 'Effect')]),
    spell: T('Ability', 'AB', '#9b8ce0', [f('cost', 'Cost'), f('range', 'Range'), f('duration', 'Duration'), f('effect', 'Effect')]),
    location: T('Location', 'LO', '#6fb0e0', [f('region', 'Region'), f('danger', 'Danger'), f('holds', 'Held by', 'ref')]),
    faction: T('Faction', 'FC', '#c9a26b', [f('scope', 'Scope'), f('goal', 'Goal'), f('asset', 'Key asset')]),
    table: T('Table', 'TB', '#7fbf6f', [f('die', 'Die'), f('scope', 'Scope')]),
    rule: T('Rule', 'RL', '#a0a8b4', [f('category', 'Category'), f('phase', 'Phase')]),
    note: T('Note', 'NT', '#8a919e', []),
    image: T('Image', 'IM', '#cf9a7a', [f('source', 'Source'), f('credit', 'Credit')]),
    blank: T('Blank', 'BL', '#8a919e', []),
  };
}

export const STARTER_ORDER = [
  'creature', 'npc', 'weapon', 'armour', 'item', 'spell',
  'location', 'faction', 'table', 'rule', 'note', 'image', 'blank',
];

export function starterSchema(): ProjectSchema {
  return { types: starterTypes(), typeOrder: STARTER_ORDER.slice() };
}

/** 'blank' is always present and is never listed in the schema grid. */
export function normaliseSchema(schema: ProjectSchema): ProjectSchema {
  const types = { ...schema.types };
  if (!types.blank) types.blank = T('Blank', 'BL', '#8a919e', []);
  const typeOrder = schema.typeOrder.includes('blank') ? schema.typeOrder.slice() : [...schema.typeOrder, 'blank'];
  return { types, typeOrder };
}

/**
 * What a first run looks like: nothing. The home screen offers a blank project and
 * an importer, and the first project you make defines its own labels from
 * `starterSchema()`.
 */
export function emptyDoc(): Doc {
  return { projects: [], areas: [], boards: [], pages: [], edges: [], schemas: {} };
}
