# Import templates

Two files you can copy to bring existing material into Cartographer, and a
description of every field. Import with **Home → IMPORT JSON**.

- **`minimal.cartographer.json`** — the smallest file that works: a name and some
  titles. Everything else is filled in on import.
- **`project.cartographer.json`** — the same format written out in full: areas,
  boards, block types with their own fields, a calendar, and a hand-drawn link.

An export from the app (**Settings → Export as JSON**) is the same format, so the
quickest way to see a real one is to make a small project and export it.

## What has to be there

Only `pages`. It has to be an array; a file without one is rejected rather than
half-imported. Everything below is optional and has a sensible answer if you leave
it out.

## Fields

### Top level

| Key | Meaning |
| --- | --- |
| `format` | `"cartographer/v1"`. Written on export; not currently checked on import. |
| `project` | `{ id, name, system, accent }`. `system` is the subtitle on the home tile; `accent` is a hex colour. |
| `areas` | Categories in the left rail. `{ id, name, defaultType }`. |
| `boards` | One canvas each, inside an area. `{ id, areaId, name }`. |
| `pages` | The documents. See below. |
| `types` | Block types, keyed by the key a page's `type` refers to. |
| `typeOrder` | Display order of those keys. |
| `calendar` | The world calendar. Omit it and you get the starter one. |
| `dictionary` | Words to add to this project's spellchecker. Names already used as titles, areas or months are picked up automatically and do not belong here. |
| `links` | Hand-drawn edges: `{ id, from, to, kind: "manual" }`. Links to pages the file does not contain are dropped. |

`projectId` on an area, board or page is ignored — it is set from `project` — so
you never have to repeat it.

### A page

| Key | Default if omitted |
| --- | --- |
| `title` | `"Untitled"` |
| `body` | `""`. Markdown. |
| `type` | the board's area's `defaultType`, else `"note"` |
| `boardId` | the first board |
| `fields` | `{}` — values keyed by the `key` of the type's fields, always strings |
| `x`, `y` | laid out four to a row rather than stacked on the origin |
| `w`, `h` | 244 × 116 |
| `custom` | `null` — follow the type's schema. `[]` means a blank page. |
| `cols` | `0` (auto) |
| `id` | generated |
| `images`, `header` | `[]` / `null`. Image *bytes* never travel in the file; only references, and those only make sense in an export from the machine that holds them. |

### A block type

```json
"npc": {
  "label": "NPC",
  "code": "NPC",
  "color": "#d98cc0",
  "fields": [{ "key": "role", "label": "Role", "kind": "text" }]
}
```

`kind` is one of `text`, `number`, `long`, `ref`, `heading`, `date`.

A `ref` field stores the **id** of the page it points at. Writing ids by hand is
miserable, so the importer also accepts a **page title** and swaps it for that
page's id — `"faction": "The Nine Sightless"` works, as long as exactly one page in
the file has that title. A value matching neither an id nor a title leaves the
field empty, which is the easiest thing to get wrong here.

A `date` field's value is `year-month-day`, with `~y` on the end when it repeats
every year — `1102-2-9`, or `1102-2-9~y` for a holiday. Dated pages appear on the
timeline; repeating ones also appear on the calendar.

## What the body can carry

- `[[Page title]]` — a link. Creates the backlink; an unresolved one offers to make
  the page.
- `![[Page title]]` — embeds that page's stat block.
- `@Page.field` — the live value of a field on another page.
- `2d6+3`, `d20` — clickable, and rolls real dice.
- `> [!gm]`, `> [!note]`, `> [!warning]` — callouts.
- Ordinary markdown otherwise: headings, lists, tables, `- [ ]` checklists, code.

## Ids

Keep them if you have them and they will be kept. Where an id already exists in the
document, the import gives that record a fresh one and repoints everything that
referred to it — so importing the same file twice gives you two independent
projects rather than one corrupted one.
