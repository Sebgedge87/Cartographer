import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Field, FieldKind, PageImage } from '../state/types';
import { blockType, creatableTypeKeys, isCustomPage, pageFields, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { attachImages, createPage, rollAndToast } from '../state/actions';
import { caretPoint } from '../lib/caret';
import { ASSET_SCHEME } from '../lib/assets';
import { useAssets } from '../lib/useAssets';
import { assetRefs, markdownContext, renderMarkdown, toggleTaskLine } from '../lib/markdown';
import {
  caretTrigger, insertBlock, prefixLine, replaceAtCaret, restoreCaret, uniqueTitle, wrapSelection,
} from '../lib/text';
import type { TextEdit } from '../lib/text';
import { FieldGrid } from './FieldGrid';
import { FieldsMenu } from './FieldsMenu';
import { ImageStrip } from './ImageStrip';

interface Option {
  code: string;
  label: string;
  hint?: string;
  sub?: string;
  color?: string;
  run: () => void;
}

const ELEMENT_ADDERS: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'TEXT' },
  { kind: 'number', label: 'NUMBER' },
  { kind: 'long', label: 'LONG TEXT' },
  { kind: 'ref', label: 'LINK' },
  { kind: 'heading', label: 'SECTION' },
];

export function PageEditor() {
  const doc = useDoc();
  const editing = useUI((s) => s.editing);
  const projectId = useUI((s) => s.projectId);
  const menu = useUI((s) => s.menu);
  const fieldsOpen = useUI((s) => s.fieldsOpen);
  const set = useUI((s) => s.set);
  const openPage = useUI((s) => s.openPage);
  const closeEditor = useUI((s) => s.closeEditor);
  const showToast = useUI((s) => s.showToast);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const bodyPicker = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const titleSizer = useRef<HTMLSpanElement>(null);
  /** Where the popover hangs: the start of the trigger, in pane coordinates. */
  const [anchor, setAnchor] = useState<{ left: number; top: number; line: number } | null>(null);
  /** Trigger the user dismissed with Esc, so syncMenu does not immediately reopen it. */
  const dismissed = useRef<string | null>(null);
  const page = doc.pages.find((p) => p.id === editing);
  const schema = schemaFor(doc, projectId);

  /* ---------- text primitives ---------- */

  const apply = useCallback(
    (edit: TextEdit | null) => {
      if (!edit || !page) return;
      doc.patchPage(page.id, { body: edit.value });
      restoreCaret(textarea.current, edit);
      set({ menu: null });
    },
    [doc, page, set],
  );

  const syncMenu = useCallback(() => {
    const trigger = caretTrigger(textarea.current);
    const current = useUI.getState().menu;
    if (!trigger) {
      dismissed.current = null;
      if (current) set({ menu: null });
      return;
    }
    const signature = `${trigger.kind}:${trigger.q}`;
    if (dismissed.current === signature) return;
    dismissed.current = null;
    if (current && current.kind === trigger.kind && current.q === trigger.q) return;
    set({ menu: { kind: trigger.kind, q: trigger.q, len: trigger.len, i: 0 } });
  }, [set]);

  /* ---------- popover options ---------- */

  const slashOptions = useMemo((): Option[] => {
    const ta = textarea.current;
    const len = menu?.len ?? 0;
    const at = (text: string, caret?: number) => () => apply(ta ? replaceAtCaret(ta, len, text, caret) : null);

    const builtins: Option[] = [
      { code: 'H1', label: 'Heading 1', hint: '#', run: at('# ') },
      { code: 'H2', label: 'Heading 2', hint: '##', run: at('## ') },
      { code: 'H3', label: 'Heading 3', hint: '###', run: at('### ') },
      { code: '“”', label: 'Quote', hint: '>', run: at('> ') },
      { code: 'GM', label: 'GM-only callout', hint: 'aside', run: at('> [!gm] ') },
      { code: '•', label: 'Bullet list', hint: '-', run: at('- ') },
      { code: '1.', label: 'Numbered list', hint: 'ol', run: at('1. ') },
      { code: '{}', label: 'Code block', hint: 'fence', run: at('```\n\n```', 4) },
      { code: 'TB', label: 'Table', hint: 'grid', run: at('| Roll | Result |\n| --- | --- |\n|  |  |\n', 2) },
      { code: 'IM', label: 'Image', hint: 'embed', run: at('![caption](image-url)', 2) },
      { code: 'H4', label: 'Heading 4', hint: '####', run: at('#### ') },
      { code: '~~', label: 'Strikethrough', hint: 'strike', run: at('~~~~', 2) },
      { code: '☑', label: 'Checklist', hint: 'task', run: at('- [ ] ') },
      { code: '—', label: 'Divider', hint: 'hr', run: at('\n---\n') },
      { code: '↗', label: 'External link', hint: 'url', run: at('[](https://)', 1) },
      { code: 'NB', label: 'Note callout', hint: 'aside', run: at('> [!note] ') },
      { code: '!!', label: 'Warning callout', hint: 'aside', run: at('> [!warning] ') },
      { code: 'd', label: 'Dice expression', hint: 'roll', run: at('2d6+3') },
      {
        code: '📅',
        label: "Today's date",
        hint: 'date',
        run: at(new Date().toISOString().slice(0, 10)),
      },
      { code: '[[', label: 'Link to page', hint: 'wikilink', run: at('[[') },
      { code: '@', label: 'Live stat reference', hint: '@Page.field', run: at('@') },
    ];

    // Derived here rather than reused from the render body below: this callback runs
    // during the same render, before those consts are initialised.
    const hostType = page ? blockType(schema, page.type) : null;
    const hostFields = page ? pageFields(doc, page) : [];

    // Table whose columns are this page type's own field labels.
    const columns = hostFields.filter((f) => f.kind !== 'heading').map((f) => f.label);
    if (columns.length && hostType) {
      builtins.push({
        code: 'TT',
        label: `Table of ${hostType.label} fields`,
        hint: 'schema',
        run: at(
          `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n` +
            `|${columns.map(() => '  ').join('|')}|\n`,
          2,
        ),
      });
    }

    // Roll tables, pre-numbered — the rows are the tedious part.
    const rollTable = (sides: number) =>
      `| d${sides} | Result |\n| --- | --- |\n` +
      Array.from({ length: sides }, (_, i) => `| ${i + 1} |  |`).join('\n') +
      '\n';
    builtins.push(
      { code: 'd6', label: 'Roll table (d6)', hint: 'random', run: at(rollTable(6), 24) },
      { code: 'd20', label: 'Roll table (d20)', hint: 'random', run: at(rollTable(20), 25) },
      {
        code: '![[',
        label: 'Embed a page’s stat block',
        hint: 'live',
        run: at('![[]]', 3),
      },
      {
        code: '@@',
        label: 'Inline stat line',
        hint: 'live',
        run: at('@@'),
      },
    );

    // One command per block type: create the page in this area and link it, without
    // ever closing the editor.
    const fromTypes: Option[] = creatableTypeKeys(schema).map((key) => {
        const type = blockType(schema, key);
        return {
          code: type.code,
          label: `New ${type.label.toLowerCase()} + link`,
          hint: `/${key}`,
          color: type.color,
          run: () => {
            if (!page) return;
            const title = uniqueTitle(
              `New ${type.label}`,
              doc.pages.filter((p) => p.projectId === page.projectId).map((p) => p.title),
            );
            createPage({
              type: key,
              boardId: page.boardId,
              at: { x: page.x + 300, y: page.y + 170 },
              title,
              keepEditor: true,
            });
            apply(ta ? replaceAtCaret(ta, len, `[[${title}]]`) : null);
            showToast(`Created ${type.label.toLowerCase()} “${title}” and linked it`);
          },
        };
    });

    return [...builtins, ...fromTypes];
  }, [apply, doc, menu?.len, page, schema, showToast]);

  const options = useMemo((): Option[] => {
    if (!menu || !page) return [];
    const query = menu.q.toLowerCase();
    if (menu.kind === 'wiki') {
      return doc.pages
        .filter(
          (p) =>
            p.projectId === page.projectId && p.id !== page.id && p.title.toLowerCase().includes(query),
        )
        .slice(0, 20)
        .map((p) => {
          const type = blockType(schema, p.type);
          return {
            code: type.code,
            label: p.title,
            hint: doc.boards.find((b) => b.id === p.boardId)?.name ?? '',
            color: type.color,
            run: () => apply(textarea.current ? replaceAtCaret(textarea.current, menu.len, `[[${p.title}]]`) : null),
          };
        });
    }
    // No cap: the list scrolls, and a truncated one hides commands you cannot
    // reach unless you already know their name.
    return slashOptions
      .filter((c) => !query || c.label.toLowerCase().includes(query) || (c.hint ?? '').includes(query));
  }, [apply, doc, menu, page, schema, slashOptions]);

  /* ---------- keyboard ---------- */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textarea.current;
      if (!ta || !page) return;

      if (menu && options.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          set({ menu: { ...menu, i: (menu.i + 1) % options.length } });
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          set({ menu: { ...menu, i: (menu.i - 1 + options.length) % options.length } });
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          options[Math.min(menu.i, options.length - 1)]?.run();
          return;
        }
      }

      // ⏎ on a wikilink with no match creates that page under the typed title.
      if (menu?.kind === 'wiki' && e.key === 'Enter' && !options.length && menu.q.trim()) {
        e.preventDefault();
        const title = menu.q.trim();
        createPage({
          boardId: page.boardId,
          at: { x: page.x + 300, y: page.y + 150 },
          title,
          keepEditor: true,
        });
        apply(replaceAtCaret(ta, menu.len, `[[${title}]]`));
        showToast(`Created page “${title}”`);
        return;
      }

      if (e.key === 'Escape' && menu) {
        e.preventDefault();
        // Stop here: the window handler would otherwise read the now-empty menu and
        // close the whole editor on the same keypress.
        e.stopPropagation();
        dismissed.current = `${menu.kind}:${menu.q}`;
        set({ menu: null });
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        closeEditor();
        return;
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        apply(wrapSelection(ta, '**', '**', 'bold'));
        return;
      }
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        apply(wrapSelection(ta, '*', '*', 'italic'));
        return;
      }
      setTimeout(syncMenu, 0);
    },
    [apply, closeEditor, menu, options, page, set, showToast, syncMenu],
  );

  /* ---------- preview ---------- */

  // Every asset the body or the strip needs, pulled in before markdown asks for it.
  const bodyRefs = useMemo(() => (page ? assetRefs(page.body) : []), [page?.body]); // eslint-disable-line react-hooks/exhaustive-deps
  const assetVersion = useAssets(bodyRefs);

  const html = useMemo(() => {
    if (!page) return '';
    const ctx = markdownContext(
      doc.pages,
      page.projectId,
      (key) => blockType(schema, key),
      (p) => pageFields(doc, p),
    );
    return renderMarkdown(page.body, ctx);
    // assetVersion is not read here — it is the signal that an image URL now resolves.
  }, [doc.pages, page, schema, assetVersion]);

  const onPreviewClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // A checkbox edits the body rather than navigating, so it goes first.
      const box = (e.target as HTMLElement).closest('[data-task]');
      if (box && page) {
        const line = Number(box.getAttribute('data-task'));
        const next = toggleTaskLine(page.body, line);
        if (next !== page.body) doc.patchPage(page.id, { body: next });
        return;
      }
      const hit = (e.target as HTMLElement).closest('[data-dice],[data-page],[data-new]');
      if (!hit) return;
      const dice = hit.getAttribute('data-dice');
      if (dice) {
        rollAndToast(dice, hit as HTMLElement);
        return;
      }
      const pid = hit.getAttribute('data-page');
      if (pid) {
        const target = doc.pages.find((p) => p.id === pid);
        if (target) openPage(target.id, target.boardId);
        return;
      }
      const title = hit.getAttribute('data-new');
      if (title && page) {
        createPage({
          boardId: page.boardId,
          at: { x: page.x + 300, y: page.y + 150 },
          title,
          keepEditor: true,
        });
        showToast(`Created page “${title}”`);
      }
    },
    [doc, openPage, page, showToast],
  );

  useEffect(() => {
    if (page) textarea.current?.focus();
  }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlighted = menu ? Math.min(menu.i, Math.max(0, options.length - 1)) : 0;

  // Size the title field to its text, capped so a long name still leaves room for
  // the tag and the close button rather than shouldering them out of the bar.
  useLayoutEffect(() => {
    const input = titleInput.current;
    const sizer = titleSizer.current;
    if (!input || !sizer) return;
    input.style.width = `${Math.min(sizer.offsetWidth + 2, 640)}px`;
  }, [page?.title]);

  // The menu follows the caret, so it has to be re-measured after every keystroke
  // that keeps it open. Anchor to the start of the trigger rather than the caret:
  // the menu then holds still while you narrow the query instead of creeping right.
  useLayoutEffect(() => {
    const ta = textarea.current;
    if (!menu || !ta) {
      setAnchor(null);
      return;
    }
    const p = caretPoint(ta, Math.max(0, ta.selectionStart - menu.len));
    setAnchor({ left: ta.offsetLeft + p.left, top: ta.offsetTop + p.top, line: p.line });
  }, [menu?.kind, menu?.q, menu?.len, page?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep it inside the pane: pull it back from the right edge, and flip it above the
  // caret's line when there is no room under it.
  useLayoutEffect(() => {
    const el = popover.current;
    const pane = textarea.current?.parentElement;
    if (!el || !pane || !anchor) return;
    const maxLeft = pane.clientWidth - el.offsetWidth - 14;
    el.style.left = `${Math.max(14, Math.min(anchor.left, maxLeft))}px`;
    const below = anchor.top + anchor.line;
    // 34px is the status strip along the foot of the pane.
    el.style.top = below + el.offsetHeight > pane.clientHeight - 34
      ? `${Math.max(14, anchor.top - el.offsetHeight - 4)}px`
      : `${below}px`;
  }, [anchor, options.length]);

  // Arrow keys move the highlight, but focus never leaves the textarea, so nothing
  // scrolls the list on its own.
  useEffect(() => {
    const list = popover.current;
    const item = list?.querySelector<HTMLElement>('.opt--active');
    if (!list || !item) return;
    const head = list.querySelector<HTMLElement>('.popover__head');
    const top = item.offsetTop - (head?.offsetHeight ?? 0);
    const bottom = item.offsetTop + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [highlighted, menu?.kind, options.length]);

  if (!page) return null;

  const type = blockType(schema, page.type);
  const custom = isCustomPage(page);
  const fields: Field[] = pageFields(doc, page);
  const backlinks = doc.edges.filter((e) => e.to === page.id);
  const words = page.body.split(/\s+/).filter(Boolean).length;
  const linkCount = doc.edges.filter((e) => e.from === page.id).length;

  const ta = () => textarea.current;

  /** Put a reference to a stored image in the body at the caret. */
  const insertImage = (image: PageImage) =>
    apply(ta() ? insertBlock(ta()!, `![${image.name}](${ASSET_SCHEME}${image.id})`) : null);

  /**
   * Import files onto this page and place them at the caret — as one edit, not one
   * per image: each insert reads the textarea's current value, and React has not
   * re-rendered it between two calls, so the second would overwrite the first.
   */
  const takeFiles = async (files: Iterable<File>) => {
    const added = await attachImages(page.id, files);
    if (added.length === 0) return;
    const text = added.map((i) => `![${i.name}](${ASSET_SCHEME}${i.id})`).join('\n\n');
    apply(ta() ? insertBlock(ta()!, text) : null);
  };

  const tools: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: 'Bold ⌘B', run: () => apply(ta() ? wrapSelection(ta()!, '**', '**', 'bold') : null) },
    { label: 'I', title: 'Italic ⌘I', run: () => apply(ta() ? wrapSelection(ta()!, '*', '*', 'italic') : null) },
    { label: 'H1', title: 'Heading 1', run: () => apply(ta() ? prefixLine(ta()!, '# ') : null) },
    { label: 'H2', title: 'Heading 2', run: () => apply(ta() ? prefixLine(ta()!, '## ') : null) },
    { label: 'H3', title: 'Heading 3', run: () => apply(ta() ? prefixLine(ta()!, '### ') : null) },
    { label: '“”', title: 'Quote', run: () => apply(ta() ? prefixLine(ta()!, '> ') : null) },
    { label: 'GM', title: 'GM-only callout', run: () => apply(ta() ? prefixLine(ta()!, '> [!gm] ') : null) },
    { label: '•', title: 'Bullet list', run: () => apply(ta() ? prefixLine(ta()!, '- ') : null) },
    { label: '1.', title: 'Numbered list', run: () => apply(ta() ? prefixLine(ta()!, '1. ') : null) },
    { label: 'TB', title: 'Table', run: () => apply(ta() ? insertBlock(ta()!, '| Roll | Result |\n| --- | --- |\n|  |  |\n') : null) },
    { label: 'IM', title: 'Add an image', run: () => bodyPicker.current?.click() },
    { label: 'HR', title: 'Divider', run: () => apply(ta() ? insertBlock(ta()!, '\n---\n') : null) },
    { label: '[[ ]]', title: 'Link to page', run: () => apply(ta() ? insertBlock(ta()!, '[[') : null) },
    { label: '@', title: 'Live stat reference', run: () => apply(ta() ? insertBlock(ta()!, '@') : null) },
    { label: '2d6', title: 'Dice', run: () => apply(ta() ? insertBlock(ta()!, '2d6+3') : null) },
  ];

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && closeEditor()}>
      <div className="editor" onPointerDown={(e) => e.stopPropagation()}>
        {/* 1. title bar */}
        <div className="editor__bar">
          <div className="editor__name">
            <input
              ref={titleInput}
              className="editor__title"
              value={page.title}
              onChange={(e) => doc.patchPage(page.id, { title: e.target.value })}
            />
            {/* Measures the title so the input can hug it and the tag sit beside the
                name rather than drifting off to the far edge of the bar. */}
            <span className="editor__sizer" ref={titleSizer} aria-hidden>{page.title || ' '}</span>
            <span className="chip chip--lg" style={{ ['--chip' as string]: type.color }}>{type.code}</span>
          </div>
          <button className="editor__close" onClick={closeEditor}>×</button>
        </div>

        {/* 2. format bar */}
        <div className="format">
          {tools.map((t) => (
            <button key={t.label} className="btn btn--sm" title={t.title} onClick={t.run}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 3. stat block / elements */}
        <div className="stats">
          <div className="stats__head">
            <button className="stats__toggle" onClick={() => set({ fieldsOpen: !fieldsOpen })}>
              <span className="stats__caret">{fieldsOpen ? '▾' : '▸'}</span>
              <span className="label">{custom ? 'Elements' : 'Stat block'}</span>
              <span className="area-row__count">{fields.length}</span>
            </button>
            <span className="spacer" />
            <FieldsMenu page={page} type={type} custom={custom} />
          </div>

          {fieldsOpen && (
            <>
              {custom && (
                <div className="stats__tools">
                  {ELEMENT_ADDERS.map((a) => (
                    <button
                      key={a.kind}
                      className="btn btn--sm"
                      onClick={() => doc.addElement(page.id, a.kind)}
                    >
                      + {a.label}
                    </button>
                  ))}
                  <span className="spacer" />
                  <span className="format__label">COLS</span>
                  {([0, 1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      className={'btn btn--sm' + (page.cols === n ? ' btn--fill' : '')}
                      onClick={() => doc.patchPage(page.id, { cols: n })}
                    >
                      {n === 0 ? 'AUTO' : n}
                    </button>
                  ))}
                </div>
              )}

              {fields.length === 0 && custom && (
                <div className="stats__empty">No elements yet — add the ones this page needs.</div>
              )}

              <div className="stats__body">
                <FieldGrid page={page} fields={fields} editable={custom} cols={page.cols} />
              </div>

            </>
          )}
        </div>

        {page.images.length > 0 && <ImageStrip page={page} onInsert={insertImage} />}

        {/* 4. split body */}
        <div className="editor__split">
          <div className="editor__pane">
            <textarea
              ref={textarea}
              className="editor__textarea"
              spellCheck={false}
              value={page.body}
              placeholder="Write. / for commands, [[ to link, @Page.field for a live stat."
              onChange={(e) => {
                doc.patchPage(page.id, { body: e.target.value });
                setTimeout(syncMenu, 0);
              }}
              onKeyDown={onKeyDown}
              onClick={() => setTimeout(syncMenu, 0)}
              onBlur={() => set({ menu: null })}
              onPaste={(e) => {
                // Only intercept when the clipboard actually holds a picture —
                // pasting text must stay untouched.
                const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
                if (files.length === 0) return;
                e.preventDefault();
                void takeFiles(files);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) e.preventDefault();
              }}
              onDrop={(e) => {
                const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
                if (files.length === 0) return;
                e.preventDefault();
                void takeFiles(files);
              }}
            />
            <input
              ref={bodyPicker}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void takeFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="editor__status">
              <span>{words} WORDS</span>
              <span>{linkCount} LINKS</span>
              <span>MARKDOWN</span>
            </div>

            {menu && (
              <div className="popover" ref={popover}>
                <div className="popover__head">{menu.kind === 'wiki' ? 'LINK TO PAGE' : 'COMMANDS'}</div>
                {options.length === 0 && (
                  <div className="palette__empty">
                    {menu.kind === 'wiki' ? 'NO MATCH — ⏎ CREATES THIS PAGE' : 'NO COMMAND MATCHES'}
                  </div>
                )}
                {options.map((o, i) => (
                  <button
                    key={`${o.code}-${o.label}`}
                    className={'opt' + (i === highlighted ? ' opt--active' : '')}
                    style={{ ['--tint' as string]: o.color ?? 'var(--dim)' }}
                    // mousedown, not click: the textarea must keep focus and its caret.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      o.run();
                    }}
                  >
                    <span className="opt__code">{o.code}</span>
                    <span className="opt__label truncate">{o.label}</span>
                    {o.hint && <span className="opt__hint">{o.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="editor__pane">
            <div className="preview" onClick={onPreviewClick}>
              {page.body.trim() ? (
                // Safe: markdown-it runs with raw HTML disabled and every custom
                // renderer escapes its own interpolations. See lib/markdown.ts.
                <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="md__empty">EMPTY — START TYPING</div>
              )}
            </div>
            <div className="preview__backlinks">
              <span className="label">Backlinks</span>
              {backlinks.length === 0 ? (
                <div className="none-line">NONE YET</div>
              ) : (
                <div className="backlink-chips">
                  {backlinks.map((e) => {
                    const from = doc.pages.find((p) => p.id === e.from);
                    if (!from) return null;
                    const t = blockType(schema, from.type);
                    return (
                      <button
                        key={e.id}
                        className="backlink"
                        style={{ ['--tint' as string]: t.color }}
                        onClick={() => openPage(from.id, from.boardId)}
                      >
                        <b>{t.code}</b>
                        {from.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
