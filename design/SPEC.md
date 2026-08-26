# Handoff: Cartographer — TTRPG / board-game drafting board

## Overview
Cartographer is a drafting application for game designers. A home screen of project
tiles opens into a project board: an infinite Miro-style canvas of typed **pages**
(creatures, weapons, armour, items, abilities, NPCs, locations, factions, roll tables,
rules, notes, images — plus fully blank pages the user shapes themselves). Pages are
grouped into **areas** listed in a left "Pages" rail, linked to each other by
`[[wikilinks]]`, drag-from-port edges and typed reference fields, and edited in a
markdown editor with a format bar and `/` commands.

The whole thing is deliberately system-agnostic: every block type, every field label
and every area name is defined **per project** and travels with that project's JSON.

## About the design files
The files in `design/` and `demo/` are **design references written in HTML** — a
working prototype showing intended look, structure and behaviour. They are **not
production code to copy**. The task is to recreate this design in a real codebase
using its established patterns; if no codebase exists yet (the `Cartographer` repo
is currently empty), `repo-scaffold/` proposes one — Vite + React + TypeScript +
Zustand, which ports cleanly to a Windows desktop build via Tauri or Electron.

- `demo/cartographer-standalone.html` — open in any browser, no server. The fastest
  way to see and feel every interaction before writing code.
- `design/Cartographer.dc.html` — the source prototype. Its logic class is plain JS
  and is the reference implementation for the data model, markdown parser, link
  derivation and board maths. Read it; don't ship it.
- `design/support.js` — prototype runtime only. **Do not port this file.**

## Fidelity
**High-fidelity.** Colours, typography, spacing, density and interaction states are
final and should be recreated closely. Every token is listed under *Design tokens*.

## Screens / views

### 1. Home — project tiles
- **Purpose**: pick or create a project; import a project JSON.
- **Layout**: centred column, `max-width: 1180px`, padding `56px 40px 72px`. Header
  row (kicker / h1 / one-line description on the left, actions on the right) above a
  `1px` bottom rule. Below it a grid: `repeat(auto-fill, minmax(288px, 1fr))`, gap `18px`.
- **Background**: `radial-gradient(1200px 700px at 50% -10%, rgba(224,164,74,.10), transparent 70%)`
  over `#0b0d11`.
- **Header**: kicker `DRAFTING ENVIRONMENT` — JetBrains Mono 500 10px, letter-spacing `.34em`,
  `#6d7684`. Title "Cartographer" — Space Grotesk 600 44px, letter-spacing `-.03em`.
  Description — Space Grotesk 400 14px/1.5, `#8a919e`, `max-width: 44ch`.
- **Actions**: `IMPORT JSON` (ghost: transparent, `1px` border `rgba(255,255,255,.14)`,
  radius `6px`, padding `9px 13px`, mono 500 12px) and `+ NEW PROJECT`
  (fill `#e0a44a`, text `#14181f`, mono 600 12px, letter-spacing `.06em`).
- **Project tile**: `linear-gradient(180deg,#14181f,#101419)`, border
  `1px solid rgba(255,255,255,.09)`, radius `10px`, padding `18px 18px 14px`. An
  absolutely-positioned 22px blueprint grid overlay at `opacity .5`
  (`linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px)` × 2 axes),
  `pointer-events: none`. Contents: project name (Space Grotesk 600 19px/1.2),
  system line (mono 400 11px, `#6d7684`), a 34px rounded-7px initials badge tinted
  from the project accent (`accent+'22'` bg, `accent+'55'` border, accent text),
  a wrapping row of area chips, then a stats footer above a `1px` top rule:
  `N PAGES / N LINKS / N AREAS` in mono 500 10px letter-spacing `.06em`.
- **Hover**: border → `rgba(255,255,255,.22)`, `transform: translateY(-2px)`.
- **Last cell**: `+ BLANK PROJECT`, dashed border, min-height `172px`; hover turns
  border and text accent.
- **Entrance**: `cgIn` — `opacity 0 / translateY(6px)` → none, `.45s ease`.

### 2. Project — top bar
Height `46px`, bg `#101419`, `1px` bottom border `rgba(255,255,255,.09)`, padding `0 12px`.
Left: a 28px back chevron, then `Project name / Area name` (project Space Grotesk 600 14px,
double-click swaps it for an inline input; area mono 500 11px `#8a919e`). Centre: a
segmented control (`#161b23`, radius `7px`, 2px padding) with `BOARD | PAGES | SCHEMA` —
active segment fills accent with `#14181f` text, mono 600 10px letter-spacing `.1em`.
Right: a filter input (180px, `#161b23`, `⌕` glyph inset left), `⌘K` and `EXPORT` buttons.

### 3. Project — left "Pages" rail
Fixed `238px`, bg `#0e1116`, right border `rgba(255,255,255,.09)`. A 30px header row
(`PAGES` mono 700 9px letter-spacing `.24em` `#6d7684`, page total on the right), a
scrolling tree, and a footer with `+ AREA` (dashed) plus a hint line
`DBL-CLICK CARD TO EDIT · DRAG PORT TO LINK` (mono 400 9px, `#414856`).

**Area row**: caret `▾/▸` (14px, click toggles collapse), a 6px rounded-2px dot tinted
with the area's default block-type colour, the name (Space Grotesk 600 11.5px, truncating),
page count, and a `+` that opens the new-page menu for that area. Active area carries a
`2px` accent left border and `rgba(255,255,255,.045)` background. Double-click renames inline.
Padding `4px 8px 4px 4px` dense / `7px 8px` comfortable.

**Page row**: indented `20px`, a 20px type code in the type colour (mono 700 8.5px),
title (Space Grotesk 400 11.5px, truncating), and `N↗` outbound count when non-zero.
Selected row: `rgba(224,164,74,.10)` bg, `#f2f4f8` text. Click selects, double-click opens
the editor.

### 4. Project — board (infinite canvas)
- **Purpose**: spatial layout of one area's pages and the links between them.
- **Camera**: `{x, y, z}`. World layer is a zero-size absolutely-positioned div with
  `transform-origin: 0 0` and `translate(x,y) scale(z)`. Zoom clamps to `0.28 – 2.2`;
  wheel zooms about the cursor (`×1.09` / `×0.917` per notch) — the listener must be
  registered non-passively so `preventDefault` works.
- **Grid**: a non-interactive underlay whose `background-position` is
  `cam.x % gsz, cam.y % gsz` with `gsz = 24 * z`. Blueprint = four layers (major lines
  at `5×gsz` `rgba(255,255,255,.045)`, minor at `gsz` `rgba(255,255,255,.022)`);
  dots = `radial-gradient(rgba(255,255,255,.10) 1px, transparent 1px)`; none = flat.
- **Card**: `244×116`, bg `#141922` (`#181d26` selected), border
  `1px solid rgba(255,255,255,.11)` (accent when selected) with a `2px` **top** border in
  the block-type colour, radius `7px`, shadow `0 6px 18px rgba(0,0,0,.35)`
  (selected: `0 0 0 1px accent55, 0 14px 34px rgba(0,0,0,.5)`), `cursor: grab`,
  `user-select: none`. Header: type-code chip (`color+'22'` bg, mono 700 8.5px) + title
  (Space Grotesk 600 12.5px, truncating). Body: up to 4 stat chips (`label` `#6d7684` /
  `value` `#c3c9d4`, mono 9.5px, values clipped to 18 chars); if the page has no filled
  scalar fields, a 96-char prose snippet at `#6d7684` instead. Footer above a `1px` rule:
  `N↗ N↘`, an `N OFF-BOARD` count in `#8a6c3a` when links leave the area, and `EDIT`.
- **Port**: 14px circle, `right: -7px; top: 50%`, bg `#161b23`, `1.5px` border
  `rgba(255,255,255,.22)`, `cursor: crosshair`; hover fills accent.
- **Edges**: one SVG spanning `12000×12000` translated by `6000,6000` so negative
  coordinates draw. Cubic bezier right-edge → left-edge with control offset
  `max(48, |dx|/2)`; when the target is to the left, it routes bottom → top instead.
  Wiki/manual edges `#4a5568`, field-reference edges `#59b8c4`, either lit to accent at
  `2px` when an endpoint is selected. Manual edges are dashed `6 5`. The in-progress
  drag draws a straight accent line dashed `5 4`.
- **Overlays**: top-left `+ NEW ▾` (accent text on `rgba(16,20,25,.92)`,
  `backdrop-filter: blur(6px)`) plus one-tap type buttons `CR NP WP IT RL` in their own
  colours; bottom-right a zoom cluster `– 100% + | FIT`.
- **Empty state**: centred `EMPTY BOARD` (mono 500 11px letter-spacing `.2em` `#414856`)
  and "Double-click anywhere to add a page".

### 5. Project — pages table
Min-width `840px` grid, columns `26px 2fr 1fr 90px 60px 60px 96px` =
`# / TITLE / AREA / TYPE / OUT / IN / UPDATED`. Sticky header on `#101419` with a
`rgba(255,255,255,.12)` bottom border, labels mono 700 9px letter-spacing `.16em`.
Rows: `1px` bottom rule `rgba(255,255,255,.05)`, hover `rgba(255,255,255,.04)`,
selected `rgba(224,164,74,.08)`. Click selects, double-click opens the editor.
Dates render `YYYY-MM-DD`.

### 6. Project — schema editor
Three stacked sections, `max-width: 1040px`, padding `22px 26px 60px`.

**Block types** — `repeat(auto-fill, minmax(320px,1fr))`, gap `14px`. Each card
`#101419`, radius `9px`; header has a `linear-gradient(90deg, color+'14', transparent)`
wash, the type code chip, an inline-editable label input, and `N USED`. Body lists
fields as `[label input] [kind select: text|number|long|link] [×]`, then `+ FIELD`.
`+ BLOCK TYPE` in the section header appends a new type. **These edits are scoped to
the current project.**

**Areas & labels** — rows of `[dot] [name input] NEW PAGES ARE [type select] N PAGES [×]`,
then `+ AREA`. Deleting an area deletes its pages and their edges.

**Extensions** — `repeat(auto-fill, minmax(230px,1fr))` info cards, each a name, an
`ON`/`SLOT` pill (`ON` = `rgba(102,195,154,.16)` on `#66c39a`) and a one-line
description. `SLOT` entries are deliberate placeholders: template library, print/layout
export, desktop build.

### 7. Project — inspector (right rail)
Fixed `288px`, bg `#0e1116`, hidden in schema view. Type chip + type select, title
input, **FIELDS** (schema-driven controls), `OPEN PAGE EDITOR` (accent fill),
**LINKS OUT**, **BACKLINKS** (clickable rows: type code, title, edge kind), and a
`DELETE PAGE` button outlined `rgba(224,104,79,.35)` with `#c9604f` text.
Empty state: `NOTHING SELECTED` + one explanatory line.

### 8. Page editor (modal over the board)
`max-width: 1160px`, `max-height: 820px`, bg `#0e1116`, `1px` border
`rgba(255,255,255,.14)`, radius `12px`, shadow `0 30px 90px rgba(0,0,0,.6)`, over a
`rgba(6,8,11,.72)` + `blur(3px)` scrim. Enters with `cgPop` (`scale(.985)` → none, `.16s`).
Four stacked bands:

1. **Title bar** — type chip, borderless title input (Space Grotesk 600 19px), area name, `×`.
2. **Format bar** — `FORMAT` label then `B I H1 H2 H3 “” GM • 1. {} TB IM HR [[ ]] @ 2d6`,
   each a 4px/8px ghost button, mono 500 10.5px, radius `4px`. Trailing hint:
   `TYPE / FOR COMMANDS · [[ TO LINK · @Page.field FOR LIVE STAT`.
3. **Stat block / elements** — collapsible. Schema-driven pages show the type's fields
   plus a `+ NEW ON SCHEMA` input (⏎ adds the field to *every* page of that type) and a
   `CUSTOMISE THIS PAGE` button that forks the layout onto the page. Custom/blank pages
   instead show a builder: `+ TEXT / NUMBER / LONG TEXT / LINK / SECTION`, a
   `COLS AUTO 1 2 3 4` control, and per-element inline label input, kind select, `↔`
   full-width toggle, `▴▾` reorder and `×`; plus `SAVE AS BLOCK TYPE` which promotes
   the layout into the project schema (headings dropped, code derived from the title).
   Grid: `repeat(cols, minmax(0,1fr))` or `repeat(auto-fill, minmax(168px,1fr))`,
   gap `8px`, `align-items: end`; wide/long/heading elements span `1 / -1`.
4. **Split body** — left a full-bleed markdown textarea (`#0b0d11`, JetBrains Mono
   400 13px/1.75, `#c8cdd6`, padding `16px 18px 40px`) with a 26px status strip
   (`N WORDS / N LINKS / MARKDOWN`); right a live preview on `#0e1116` (Space Grotesk
   400 14px/1.72) above a **BACKLINKS** chip row.

**Autocomplete popover** — anchored `bottom: 34px`, inset `14px`, max-height `284px`,
bg `#12161c`, `1px` border `rgba(255,255,255,.16)`, radius `8px`, shadow
`0 18px 50px rgba(0,0,0,.6)`. Header `COMMANDS` or `LINK TO PAGE`. Rows: code, label,
right-aligned hint; the highlighted row gets `rgba(224,164,74,.13)` and a `2px` accent
left border. Selection must be made on `mousedown` with `preventDefault` so the
textarea keeps focus and its caret.

### 9. New-page menu
A fixed 300px popover positioned under whichever trigger opened it (board `+ NEW ▾` or
an area's `+`), on a full-screen click-catcher. Header `NEW PAGE / IN <AREA>`. First
item is **Blank page** — "Add your own elements, labels and layout"; then every block
type in the project, each showing up to four of its field labels as the sub-line.

### 10. Command palette (⌘K)
Fixed overlay, `padding-top: 14vh`, panel `min(620px, 92vw)` on `#12161c`. A single
query input over a scrolling result list (max-height `52vh`). Result groups by code:
`ACT` actions, `VIEW` view switches, `SYS` export/back, `AREA` area jumps, and every
page by its type code. Same highlight treatment as the autocomplete.

### 11. Toast
Fixed bottom-centre, `#161b23`, `1px` border `rgba(224,164,74,.4)`, radius `7px`,
mono 500 12.5px `#f0d3a0`, auto-dismiss after `2200ms`. Used for dice results, link
creation, page creation, schema changes.

## Interactions & behaviour

**Board pointer model** — one pointer-down handler on the board resolves, in order:
`closest('[data-port]')` → start a link drag; `closest('[data-pid]')` → drag that card;
otherwise pan. Use `setPointerCapture` and move by pointer **deltas** divided by `z`
(never absolute positions) so drags stay locked at any zoom. On pointer-up during a link
drag, resolve the target with `document.elementFromPoint` → `closest('[data-pid]')` and
add a `manual` edge if one doesn't already exist. Double-click empty canvas creates a
page at that world point; double-click a card opens the editor.

**Link derivation** — `[[Title]]` matches page titles case-insensitively and produces
`wiki` edges, recomputed from body text on every page write (manual and field edges are
preserved). Fields of kind `ref` produce `field` edges, recomputed for that page when a
ref value changes. Only edges whose *both* endpoints are in the visible area are drawn;
the rest surface as the card's `OFF-BOARD` count.

**Slash commands** — the trigger is `/word` at a line start (regex `(?:^|\n)\/([\w-]*)$`
against the text before the caret). Built-ins: h1–h3, quote, GM callout, bullet/numbered
list, code fence, table, image, dice, `[[`, `@`. Then one entry per block type:
"New <type> + link" creates the page in the current area, offset `+300,+170` from the
host card, de-duplicates the title, and replaces the trigger with `[[Title]]` in a single
operation — the editor must not close.

**Wikilink autocomplete** — trigger `[[` with the partial after it (`\[\[([^\]\n]*)$`).
Lists matching pages in the project excluding the current one. ⏎ with **no** match
creates a page with that exact title and links it.

**Keyboard** — ↑/↓ move the popover selection, ⏎/Tab accept, Esc closes popover →
editor → palette in that order. `⌘/Ctrl+B` and `⌘/Ctrl+I` wrap the selection,
`⌘/Ctrl+Enter` closes the editor, `⌘/Ctrl+K` opens the palette anywhere, `N` creates
a page when not typing.

**Text operations** — three primitives, all of which must restore focus and set the
caret afterwards: `wrapSel(pre, post, placeholder)`, `prefixLine(prefix)`,
`insertBlock(text, caretOffset)`, plus `replaceAtCaret(len, text, caretOffset)` for
popover accepts.

**Markdown** — a small hand-rolled block parser (headings 1–4, `---`, blockquote with
`[!gm]`/`[!note]` callout tags, bullet and ordered lists, fenced code, pipe tables,
paragraphs) over an inline pass, in this order: images → wikilinks → normal links →
`@Page.field` → inline code → bold → italic → dice. Inline results:
- **Wikilink, resolved** → a clickable chip, `color+'1f'` bg / `color+'55'` border, type
  code then title. Clicking opens that page.
- **Wikilink, unresolved** → dashed `rgba(224,104,79,.55)` border, `#c9604f` text, a
  trailing `+`. Clicking creates the page.
- **`@Page.field`** → a live stat chip showing the field name and the target's current
  value (`—` when empty). This is the "reference chip to a stat" — it must read through
  to the source page, not copy it.
- **Dice** (`\b\d{0,3}d\d{1,3}([+-]\d{1,3})?\b`) → an accent-tinted clickable chip;
  clicking rolls (cap 20 dice) and toasts `2d6+3 → [4 5] +3 = 12`.
- **Image** with an empty or placeholder URL → a dashed `IMAGE PLACEHOLDER · <alt>` box;
  a real URL renders the image at `max-width: 100%`, radius `6px`.
Escape HTML before any of this. In production prefer a maintained parser
(remark/markdown-it) with custom plugins for the wikilink, stat-reference and dice tokens.

**Per-project schemas** — `types` and `typeOrder` are stored per project id. Opening a
project loads its schema; leaving it writes the working copy back. A new project clones
the current schema as a starting point; an imported project keeps its own.

**Persistence** — the prototype writes the whole store to `localStorage` under
`cartographer.v1` on every update. Replace this: see *Recommended implementation*.

**Export / import** — `{format:"cartographer/v1", project, areas, pages, types, typeOrder, links}`
downloaded as `<project-slug>.cartographer.json`; import appends the project with its own
schema.

## State management
```
projects[]  { id, name, system, accent }
areas[]     { id, projectId, name, defaultType }
pages[]     { id, projectId, areaId, type, title, x, y, w, h,
              fields: Record<fieldKey, string>,
              custom: Field[] | null,   // per-page layout override; [] for blank pages
              cols: 0 | 1 | 2 | 3 | 4,  // 0 = auto-fill
              body: string, updated: number }
edges[]     { id, from, to, kind: 'wiki' | 'manual' | 'field' }
schemas     Record<projectId, { types, typeOrder }>
types       Record<typeKey, { label, code, color, fields: Field[] }>
Field       { key, label, kind: 'text'|'number'|'long'|'ref'|'heading', wide?: boolean }
```
Ephemeral UI state: `view`, `projectId`, `areaId`, `mode` (board|table|schema), `sel`,
`editing`, `cam`, `drag`, `link`, `ghost`, `menu`, `newMenu`, `cmd`, `toast`, `search`,
`collapsed`, `fieldsOpen`, `renamingArea`, `renamingProject`.

Keep documents (projects/areas/pages/edges/schemas) separate from ephemeral UI state so
undo/redo and autosave only ever touch documents. `edges` is derived for `wiki` and
`field` kinds and authored for `manual` — keep that distinction or wiki edges will
resurrect after deletion.

## Design tokens

**Colour**
| Token | Value | Use |
| --- | --- | --- |
| canvas | `#0b0d11` | board, editor textarea, app background |
| panel | `#0e1116` | rails, editor shell, preview |
| chrome | `#101419` | top bar, table header, schema cards |
| popover | `#12161c` | palette, autocomplete, new-page menu |
| card | `#141922` | board card |
| card-selected | `#181d26` | selected board card |
| input | `#161b23` | inputs, selects, chips, toast |
| code-bg | `#0a0c10` | fenced code |
| border | `rgba(255,255,255,.09)` | default hairline |
| border-strong | `rgba(255,255,255,.16)` | popovers |
| border-hover | `rgba(255,255,255,.22–.32)` | hover |
| accent | `#e0a44a` | primary, selection, active segment |
| accent-tint | `rgba(224,164,74,.13)` | highlighted row |
| link | `#59b8c4` / hover `#8fd8e0` | anchors, field edges |
| text | `#e7e9ee` · `#f2f4f8` (emphasis) · `#d3d8e0` (preview) · `#c8cdd6` (mono body) |
| muted | `#8a919e` · dim `#6d7684` · faint `#5c6472` · ghost `#414856` · `#4d5563` |
| danger | `#e0684f` · text `#c9604f` · border `rgba(224,104,79,.35)` |
| ok | `#66c39a` on `rgba(102,195,154,.16)` |
| off-board | `#8a6c3a` |

**Block-type colours** — creature `#e0684f`, npc `#d98cc0`, weapon `#e0a44a`,
armour `#8fa5c9`, item `#66c39a`, ability `#9b8ce0`, location `#6fb0e0`,
faction `#c9a26b`, table `#7fbf6f`, rule `#a0a8b4`, note `#8a919e`, image `#cf9a7a`,
blank `#8a919e`. Chips derive from these with `+'22'` (fill), `+'55'` (border),
`+'1f'` (inline wikilink fill), `+'14'` (schema header wash).

**Typography** — Space Grotesk (400/500/600/700) for UI and prose; JetBrains Mono
(400/500/700) for labels, codes, data and the markdown textarea. Scale in use:
44 / 22 / 19 / 15 / 14 / 13.5 / 13 / 12.5 / 12 / 11.5 / 11 / 10.5 / 10 / 9.5 / 9 / 8.5 px.
All-caps mono labels carry letter-spacing `.06em`–`.34em`; large Space Grotesk headings
carry `-.01em` to `-.03em`. Body line-height `1.7–1.75`, headings `1.2–1.25`.

**Radius** `3 / 4 / 5 / 6 / 7 / 9 / 10 / 12` px · **Shadow** `0 6px 18px rgba(0,0,0,.35)`
(card), `0 14px 34px rgba(0,0,0,.5)` (selected), `0 18px 50px rgba(0,0,0,.6)` (popover),
`0 30px 90px rgba(0,0,0,.6)` (modal) · **Fixed sizes** top bar 46, rail 238,
inspector 288, section header 30, card 244×116, port 14, grid unit 24.

**Motion** — `cgIn` `.18–.45s ease` (fade + 6px rise), `cgPop` `.12–.16s ease`
(fade + `scale(.985)`), toast `2200ms` dwell. Nothing else animates; drags and zoom are
direct-manipulation and must stay untweened.

## Assets
None. Two Google fonts (Space Grotesk, JetBrains Mono) — self-host them for the desktop
build. All iconography is text glyphs (`‹ × + – ▾ ▸ ▴ ↔ ↗ ↘ ⌕ ⌘ “”`); swap for a real
icon set if the codebase has one.

## Recommended implementation
- **Web + Windows from one codebase**: Vite + React + TypeScript, wrapped in **Tauri**
  for the installable build (small binary, native file dialogs). Electron is the
  alternative if Node APIs are needed in-process.
- **State**: Zustand (or Redux Toolkit) with documents split from UI state; `zundo` gives
  undo/redo cheaply.
- **Persistence**: file-per-project JSON — `cartographer/v1` is already the on-disk
  format. Desktop writes real files; web uses the File System Access API with IndexedDB
  as the fallback. Keep localStorage for session/UI state only.
- **Canvas**: plain DOM transforms as prototyped are fine to a few hundred cards.
  Virtualise by viewport before considering a canvas/WebGL renderer.
- **Markdown**: markdown-it or remark plus three custom inline rules (wikilink,
  `@Page.field`, dice). Sanitise output; the prototype's `dangerouslySetInnerHTML` is a
  prototype affordance, not a pattern to keep.
- **Extensibility**: the `SLOT` extension cards mark the intended seams — a block-type
  registry (schema-defined types already behave as plugins), a slash-command registry,
  and an importer/exporter interface keyed on `format`.

## Files
- `demo/cartographer-standalone.html` — self-contained runnable prototype.
- `design/Cartographer.dc.html` — prototype source (markup + logic class).
- `design/support.js` — prototype runtime; do not port.
- `repo-scaffold/` — proposed repo layout, ready to commit into `Sebgedge87/Cartographer`.
- `MIGRATION.md` — how to replace the current repo contents and stage the work.
