# Cartographer

A drafting board for TTRPG and board-game design. Projects hold **areas** (the left
rail); areas hold **pages** laid out on an infinite board; pages carry a user-defined
stat block and a markdown body, and link to each other by wikilink, reference field or
hand-drawn edge. Every block type and field label is defined per project, so the tool
is not tied to any one game system.

## Status
Implemented and running. Everything in `design/SPEC.md` is built: home tiles, the
board, the pages table, the schema editor, the inspector and the page editor, plus
JSON import/export, the command palette and undo/redo.

A first run starts **empty** — no sample content. The home screen offers a blank
project and the JSON importer, and the first project you make brings its own block
types from `starterSchema()`, which you then rename to suit your game.

Optional **sync** keeps one person's projects on every machine they use — see
*Syncing across machines* below. Without it the app runs local-only, which is a
fully supported mode, not a degraded one.

Deliberately still open (they are marked `SLOT` in the schema view's Extensions
section): the template library, print/layout export, and the Tauri desktop wrapper.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
npm test         # merge, calendar, word-scanning and dictionary tests
```

## Reference
- **`design/SPEC.md`** — the complete spec: screens, tokens, measurements, interactions.
- **`design/cartographer-standalone.html`** — the original prototype. Open it in a
  browser to compare behaviour. Reference only; none of its code is shipped.

## Layout
```
src/
  main.tsx              boots the document store, then renders
  App.tsx               view switch + global keyboard
  state/
    types.ts            document model — also the on-disk format (cartographer/v1)
    graph.ts            link derivation, camera maths, edge paths, dice
    defaults.ts         starter block types and the empty first-run document
    docStore.ts         documents + undo history (zustand + zundo), autosave
    uiStore.ts          ephemeral UI state — never touched by undo or autosave
    syncStore.ts        sync status for the UI
    actions.ts          operations that span both stores
    sync/
      rows.ts           document types <-> database rows
      merge.ts          last-write-wins merge (pure, and tested)
      engine.ts         diff, push, pull, realtime
      auth.ts           session watching, sign in / up / out
  lib/
    markdown.ts         markdown-it + wikilink / @stat / dice rules
    text.ts             textarea primitives and caret-trigger detection
    words.ts            the words in a markdown body — code and links are not prose
    dictionary.ts       a project's own vocabulary, harvested from what it names
    spell.worker.ts     the spellchecker: Hunspell, off the main thread
    spell.ts            its client, plus the on/off preference
    io.ts               project file build / parse / download
    persist.ts          IndexedDB local storage (localStorage fallback)
    supabase.ts         client, created only when credentials are configured
  components/           home, top bar, rail, board, table, schema, inspector, editor,
                        new-page menu, command palette, toast
  styles/               tokens.css (design tokens) + app.css (components)
design/                 SPEC.md, cartographer-standalone.html
supabase/               schema.sql — run once in the Supabase SQL editor
```

## How it fits together

**Documents vs UI.** `docStore` holds projects, areas, pages, edges and per-project
schemas — the things that are undone, redone and saved. `uiStore` holds the camera,
selection, open editor, popovers and toasts. Nothing in `uiStore` is persisted or
enters the undo history.

**Edges are part derived, part authored.** `wiki` edges are recomputed from every
page body on each write, `field` edges from a page's `ref` values when one changes,
and `manual` edges exist only because someone dragged a card port. Keeping that
distinction is what stops deleted wikilinks from resurrecting.

**Schemas are per project.** `schemas[projectId]` owns that project's block types and
their order; a new project clones the starter set, an imported one keeps its own.
Renaming "Vitality" to "Hull" in one project never touches another.

The list is yours to shape, in the SCHEMA view. Add types, rename them, reorder
them, and either **hide** or **delete** the ones you do not want:

- **Hide** keeps the type and every page using it, but stops offering it when you
  make a page — no new-page menu entry, no quick button on the board, no `/command`.
  It is the safe everyday way to clear the starter types you will never use.
- **Delete** removes it outright, and is refused while any page still uses it. The
  button says how many, so nothing disappears from under a page you have written.

Everywhere a type is offered reads the same list, so hiding or reordering shows up
in the new-page menu, the board's quick buttons and the editor's `/` commands at
once. A type <select> additionally keeps whichever type is already selected, even
when hidden, so opening a page can never silently retype it.

**Link rendering.** Edges leave each card from the side that actually faces the
other, then bow across the gap. The arc is perpendicular to the chord, ramps in with
distance so neighbouring cards get a gentle lean while long spans get a real curve,
and varies per edge from a hash of its id — so no two are congruent and the board
reads as drawn rather than ruled. This is a deliberate departure from `SPEC.md`,
which specifies rigid right-edge to left-edge routing.

**Markdown.** markdown-it with raw HTML disabled, plus three custom inline rules —
`[[wikilink]]`, `@Page.field` and dice expressions — matched in a core pass over the
text tokens, so they can never fire inside a code span or a link href.

**Persistence.** The document is written to IndexedDB (debounced), with a
localStorage fallback. `cartographer/v1` JSON is the interchange format, so a project
exported from the browser is exactly what a desktop build would write to disk. When
sync is configured, that local store becomes a fast cache in front of Postgres
rather than the only copy.

## Syncing across machines

Sync is off until you configure it. Setup is one service and two values.

1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough).
2. Open the SQL editor and run **`supabase/schema.sql`** once. It creates the four
   tables, the row-level-security policies and the realtime publication, and it is
   safe to re-run.
3. In *Project Settings → Data API*, copy the **Project URL** and the **anon /
   publishable key**.
4. `cp .env.example .env.local` and paste them in. Restart `npm run dev`.

You will now be asked to sign in — email and password, no other provider to
configure. Sign up once on the first machine and sign in with the same account
everywhere else. The status chip in the top bar shows `SYNCED`; click it to force a
round trip, double-click to sign out.

**How it behaves**

- The local store is still what the UI reads and writes, so dragging a card and
  typing a body never wait on the network. Changes are diffed per row and pushed on
  a debounce — a drag writes one page row when it settles, not one per frame.
- Conflicts resolve **last-write-wins per row**. Two machines editing different
  pages both survive; the same page at the same moment does not. That is the right
  trade for one person on several machines and the wrong one for a team — see
  *Limits*.
- Only `manual` edges are stored. Wiki and field edges are derived from page bodies
  and ref values, so syncing them would mean writing rows on every keystroke.
- Signing out is not required to keep working. If the server is unreachable, or you
  choose *Work offline on this device*, the app runs local-only and reconciles when
  you sign in again.

**Security.** Every table has row-level security keyed to `auth.uid()`, so the anon
key in the client grants access to nothing but your own rows. That is what makes it
safe to ship the key in a static build; the policies in `supabase/schema.sql` are
not optional decoration.

**Limits.** Two people editing the same page body at the same time will lose one of
the edits — there is no character-level merge. Making that safe needs a CRDT and a
different persistence layer.

## Stack
Vite · React · TypeScript · Zustand (+ zundo for undo) · markdown-it.
Intended to wrap in **Tauri** for the installable Windows build — the web and desktop
builds share the same JSON project format, so files move freely between them.
