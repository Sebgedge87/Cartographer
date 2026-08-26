import { useEffect, useMemo, useRef } from 'react';
import { blockType, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { createArea, createPage, createProject, exportCurrentProject, openProject } from '../state/actions';

interface Item {
  code: string;
  label: string;
  hint: string;
  color: string;
  run: () => void;
}

export function CommandPalette() {
  const doc = useDoc();
  const cmd = useUI((s) => s.cmd);
  const view = useUI((s) => s.view);
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const set = useUI((s) => s.set);
  const goHome = useUI((s) => s.goHome);
  const openPage = useUI((s) => s.openPage);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cmd) input.current?.focus();
  }, [!!cmd]); // eslint-disable-line react-hooks/exhaustive-deps

  const schema = schemaFor(doc, projectId);

  const items = useMemo((): Item[] => {
    const close = () => set({ cmd: null });
    const out: Item[] = [];

    if (view === 'project') {
      const area = doc.areas.find((a) => a.id === areaId);
      out.push({
        code: 'ACT', label: `New page in ${area?.name ?? 'this area'}`, hint: 'N', color: '#e0a44a',
        run: () => { close(); createPage(); },
      });
      out.push({ code: 'ACT', label: 'New area', hint: '', color: '#e0a44a', run: () => { close(); createArea(); } });
      out.push({ code: 'VIEW', label: 'Board view', hint: '', color: '#59b8c4', run: () => set({ cmd: null, mode: 'board' }) });
      out.push({ code: 'VIEW', label: 'Pages table', hint: '', color: '#59b8c4', run: () => set({ cmd: null, mode: 'table' }) });
      out.push({ code: 'VIEW', label: 'Schema editor', hint: '', color: '#59b8c4', run: () => set({ cmd: null, mode: 'schema' }) });
      out.push({ code: 'SYS', label: 'Export project JSON', hint: '', color: '#8a919e', run: () => { close(); exportCurrentProject(); } });
      out.push({ code: 'SYS', label: 'Back to projects', hint: '', color: '#8a919e', run: () => { close(); goHome(); } });

      for (const a of doc.areas.filter((x) => x.projectId === projectId)) {
        out.push({
          code: 'AREA', label: a.name, hint: 'switch board', color: '#c9a26b',
          run: () => set({ cmd: null, areaId: a.id, mode: 'board', sel: null }),
        });
      }
      for (const p of doc.pages.filter((x) => x.projectId === projectId)) {
        const type = blockType(schema, p.type);
        out.push({
          code: type.code, label: p.title, hint: 'open page', color: type.color,
          run: () => { close(); openPage(p.id, p.areaId); },
        });
      }
    } else {
      for (const p of doc.projects) {
        out.push({ code: 'PRJ', label: p.name, hint: 'open', color: p.accent, run: () => { close(); openProject(p.id); } });
      }
      out.push({ code: 'ACT', label: 'New project', hint: '', color: '#e0a44a', run: () => { close(); createProject(); } });
    }

    const q = (cmd?.q ?? '').toLowerCase();
    return out
      .filter((o) => !q || o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q))
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, view, projectId, areaId, cmd?.q, schema]);

  if (!cmd) return null;
  const highlighted = Math.min(cmd.i, Math.max(0, items.length - 1));

  return (
    <div className="palette" onClick={() => set({ cmd: null })}>
      <div className="palette__panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="palette__input"
          placeholder="Jump to a page, area or action…"
          value={cmd.q}
          onChange={(e) => set({ cmd: { q: e.target.value, i: 0 } })}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              set({ cmd: { ...cmd, i: Math.min(cmd.i + 1, items.length - 1) } });
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              set({ cmd: { ...cmd, i: Math.max(cmd.i - 1, 0) } });
            } else if (e.key === 'Enter' && items.length) {
              e.preventDefault();
              items[highlighted]?.run();
            }
          }}
        />
        <div className="palette__list">
          {items.length === 0 && <div className="palette__empty">NOTHING MATCHES</div>}
          {items.map((item, i) => (
            <button
              key={`${item.code}-${item.label}-${i}`}
              className={'opt' + (i === highlighted ? ' opt--active' : '')}
              style={{ ['--tint' as string]: item.color }}
              onMouseDown={(e) => {
                e.preventDefault();
                item.run();
              }}
            >
              <span className="opt__code">{item.code}</span>
              <span className="opt__label truncate">{item.label}</span>
              {item.hint && <span className="opt__hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
