import type { Area, BlockType, Doc, Edge, Field, Page, Project, ProjectSchema } from './types';
import { deriveWikiEdges } from './graph';

const f = (key: string, label: string, kind: Field['kind'] = 'text'): Field => ({ key, label, kind });
const T = (label: string, code: string, color: string, fields: Field[]): BlockType => ({ label, code, color, fields });

/** The block type every project starts with. Cloned into each new project's schema. */
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

const page = (
  id: string, projectId: string, areaId: string, type: string, title: string,
  x: number, y: number, fields: Record<string, string> = {}, body = '',
): Page => ({
  id, projectId, areaId, type, title, x, y, w: 244, h: 116,
  fields, custom: null, cols: 0, body, updated: Date.now(),
});

/** Demo content, written once on first run so the board is never empty on arrival. */
export function seed(): Doc {
  const projects: Project[] = [
    { id: 'p1', name: 'The Veil', system: 'TTRPG · system-agnostic', accent: '#e0a44a' },
    { id: 'p2', name: 'Ironroot Skirmish', system: 'Board game · hex skirmish', accent: '#7fbf6f' },
    { id: 'p3', name: 'Untitled Draft', system: 'Empty', accent: '#8fa5c9' },
  ];

  const areas: Area[] = [
    { id: 'a1', projectId: 'p1', name: 'Lore', defaultType: 'note' },
    { id: 'a2', projectId: 'p1', name: 'Creatures', defaultType: 'creature' },
    { id: 'a3', projectId: 'p1', name: "NPC's", defaultType: 'npc' },
    { id: 'a4', projectId: 'p1', name: 'Gear', defaultType: 'item' },
    { id: 'a5', projectId: 'p1', name: 'Rules', defaultType: 'rule' },
    { id: 'a6', projectId: 'p1', name: 'Tables', defaultType: 'table' },
    { id: 'a7', projectId: 'p1', name: 'World', defaultType: 'location' },
    { id: 'b1', projectId: 'p2', name: 'Units', defaultType: 'creature' },
    { id: 'b2', projectId: 'p2', name: 'Cards', defaultType: 'item' },
    { id: 'b3', projectId: 'p2', name: 'Turn structure', defaultType: 'rule' },
  ];

  const pages: Page[] = [
    page('g1', 'p1', 'a1', 'note', 'What the game is', 0, 0, {},
      '# What the game is\n\nA game about **reflections that keep their own counsel**. Players are Wardens who cross the Veil — the space between a mirror and its image — to settle debts the living cannot.\n\n> [!gm] The Veil does not lie. It only edits.\n\n## Pillars\n- Every crossing costs something you can name\n- Violence is fast, cheap and permanent\n- The map is a rumour until someone dies on it\n\nStart with [[Reflection Checks]], then [[Veil Pressure]].'),
    page('g2', 'p1', 'a1', 'note', 'The Veil', 300, 170, {},
      'The Veil is the space between a mirror and its image.\n\nCrossing needs a **true surface** and a debt. See [[Veil Pressure]] and the [[Mirrorwalker]].'),
    page('c1', 'p1', 'a2', 'creature', 'Mirrorwalker', 0, 0,
      { threat: 'Severe', hp: '34', speed: '9 / phase', defence: 'Silvered 2', drive: 'Collect what was promised' },
      '## Mirrorwalker\n\nA silhouette that arrives one breath before its body. Fights the reflection of a target, not the target.\n\n- **Split Step** — when hit, moves to any reflective surface within 2d6 metres.\n- **Debt Claim** — target answers @Mirrorwalker.threat or loses a memory.\n\nCarries a [[Splinter of the First Mirror]]. Bound by [[Reflection Checks]].'),
    page('c2', 'p1', 'a2', 'creature', 'Glass Hound', 300, 190,
      { threat: 'Moderate', hp: '12', speed: '14 / phase', defence: 'Brittle 1', drive: 'Hunt in threes' },
      'Hunts in threes. Shatters on death for 1d6 to everything adjacent.\n\nOften pack-bound to a [[Mirrorwalker]].'),
    page('n1', 'p1', 'a3', 'npc', 'Cassiel Vane', 0, 0,
      { role: 'Broker of crossings', faction: 'f1', attitude: 'Amused, patient', seen_at: 'l1' },
      'Sells directions to places that are not there. Never appears in a photograph.\n\nWill trade a crossing for a name. Knows the [[Mirrorwalker]] by an older name.'),
    page('w1', 'p1', 'a4', 'weapon', 'Silvered Bayonet', 0, 0,
      { damage: '2d6+2', range: 'Reach', hands: '1', traits: 'Silvered, Cuts reflections' },
      'Cuts the image before it cuts the body. Effective against [[Mirrorwalker]] and [[Glass Hound]].'),
    page('w2', 'p1', 'a4', 'armour', 'Ashcoat', 300, 175,
      { protection: '3', bulk: '1', traits: 'Dulls reflection' },
      'A coat that refuses to be reflected. −1 to any [[Reflection Checks]] made against the wearer.'),
    page('i1', 'p1', 'a4', 'item', 'Splinter of the First Mirror', 150, 350,
      { rarity: 'Unique', value: 'Unsellable', effect: 'One crossing without a debt' },
      'One crossing, no debt. Then it chooses a new bearer.\n\nCarried by the [[Mirrorwalker]].'),
    page('r1', 'p1', 'a5', 'rule', 'Reflection Checks', 0, 0,
      { category: 'Core resolution', phase: 'Any' },
      '## Reflection Checks\n\nRoll 2d6 + Poise against the surface’s clarity.\n\n| Result | Outcome |\n| --- | --- |\n| 10+ | You cross clean |\n| 7-9 | You cross, the Veil keeps something |\n| 6- | Your reflection crosses instead |\n\nRaise the stakes with [[Veil Pressure]].'),
    page('r2', 'p1', 'a5', 'rule', 'Veil Pressure', 300, 180,
      { category: 'Clock', phase: 'End of scene' },
      'A 6-segment clock. Tick on every failed [[Reflection Checks]]. At 6, a [[Mirrorwalker]] arrives.'),
    page('t1', 'p1', 'a6', 'table', 'd66 Veil Bleed', 0, 0,
      { die: 'd66', scope: 'Scene dressing' },
      '| Roll | Bleed |\n| --- | --- |\n| 11 | Every surface shows yesterday |\n| 24 | Your shadow arrives late |\n| 36 | A door that only opens inward |\n| 52 | Someone else’s reflection waves |\n| 66 | The room is already remembered |'),
    page('l1', 'p1', 'a7', 'location', 'The Hollow Arcade', 0, 0,
      { region: 'Lowtown', danger: 'Moderate', holds: 'f1' },
      'Forty-one shopfronts, thirty-nine of them mirrored. [[Cassiel Vane]] keeps a table at the back.'),
    page('f1', 'p1', 'a7', 'faction', 'The Nine Sightless', 40, 210,
      { scope: 'City', goal: 'Close every true surface', asset: 'A ledger of debts' },
      'They blind themselves so nothing can be taken through their eyes. Own [[The Hollow Arcade]] in all but name.'),
    page('u1', 'p2', 'b1', 'creature', 'Ironroot Warden', 0, 0,
      { threat: '3 cost', hp: '4', speed: '2 hex', defence: '5+', drive: 'Hold the grove' },
      'Costs 3. Cannot be pushed off a grove hex.\n\nCarries [[Bramble Maul]].'),
    page('u2', 'p2', 'b2', 'weapon', 'Bramble Maul', 300, 170,
      { damage: '2 hits', range: '1 hex', hands: '2', traits: 'Slow' },
      'Attack after moving: −1 hit. See [[Initiative Ladder]].'),
    page('u3', 'p2', 'b3', 'rule', 'Initiative Ladder', 0, 0,
      { category: 'Sequencing', phase: 'Round start' },
      'Lowest cost acts first. Ties resolve toward the player holding fewer objectives.'),
  ];

  // Seeded 'ref' fields hold page ids; turn each into a field edge.
  const byId = new Set(pages.map((p) => p.id));
  const fieldEdges: Edge[] = [];
  for (const p of pages) {
    for (const value of Object.values(p.fields)) {
      if (value && byId.has(value)) {
        fieldEdges.push({ id: `r:${p.id}:${value}`, from: p.id, to: value, kind: 'field' });
      }
    }
  }

  const schemas: Record<string, ProjectSchema> = {};
  for (const p of projects) schemas[p.id] = starterSchema();

  return { projects, areas, pages, edges: deriveWikiEdges(pages, fieldEdges), schemas };
}
