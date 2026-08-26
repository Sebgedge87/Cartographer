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

Deliberately still open (they are marked `SLOT` in the schema view's Extensions
section): the template library, print/layout export, and the Tauri desktop wrapper.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
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
    seed.ts             starter block types and first-run demo content
    docStore.ts         documents + undo history (zustand + zundo), autosave
    uiStore.ts          ephemeral UI state — never touched by undo or autosave
    actions.ts          operations that span both stores
  lib/
    markdown.ts         markdown-it + wikilink / @stat / dice rules
    text.ts             textarea primitives and caret-trigger detection
    io.ts               project file build / parse / download
    persist.ts          IndexedDB document storage (localStorage fallback)
  components/           home, top bar, rail, board, table, schema, inspector, editor,
                        new-page menu, command palette, toast
  styles/               tokens.css (design tokens) + app.css (components)
design/                 SPEC.md, cartographer-standalone.html
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

**Markdown.** markdown-it with raw HTML disabled, plus three custom inline rules —
`[[wikilink]]`, `@Page.field` and dice expressions — matched in a core pass over the
text tokens, so they can never fire inside a code span or a link href.

**Persistence.** The whole document is written to IndexedDB (debounced), with a
localStorage fallback. `cartographer/v1` JSON is the interchange format, so a project
exported from the browser is exactly what a desktop build would write to disk.

## Stack
Vite · React · TypeScript · Zustand (+ zundo for undo) · markdown-it.
Intended to wrap in **Tauri** for the installable Windows build — the web and desktop
builds share the same JSON project format, so files move freely between them.
