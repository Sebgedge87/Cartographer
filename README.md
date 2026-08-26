# Cartographer

A drafting board for TTRPG and board-game design. Projects hold **areas** (the left
rail); areas hold **pages** laid out on an infinite board; pages carry a user-defined
stat block and a markdown body, and link to each other by wikilink, reference field or
hand-drawn edge. Every block type and field label is defined per project, so the tool
is not tied to any one game system.

## Status
Scaffold. The design is fully specified and there is a runnable reference prototype —
the app itself is not implemented yet.

- **`design/SPEC.md`** — complete spec: screens, tokens, measurements, interactions.
- **`design/cartographer-standalone.html`** — open in a browser. Working prototype of
  every interaction described in the spec. Reference only; do not port its code.
- **`src/state/types.ts`** — the document model, which is also the on-disk format
  (`cartographer/v1`).
- **`src/state/graph.ts`** — link derivation, camera maths, edge paths, dice.

## Run
```bash
npm install
npm run dev
```

## Stack
Vite · React · TypeScript · Zustand (+ zundo for undo) · markdown-it.
Intended to wrap in **Tauri** for the installable Windows build — the web and desktop
builds share the same JSON project format, so files move freely between them.

## Layout
```
src/
  main.tsx
  state/      types.ts  graph.ts   (store, persistence, selectors)
  components/ (home, board, rail, editor, schema, inspector)
  lib/        (markdown + wikilink / @stat / dice plugins)
  styles/     tokens.css
design/       SPEC.md  cartographer-standalone.html
```
