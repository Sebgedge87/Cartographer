import { blockType, creatableTypeKeys, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { promptNew, suggestPageName } from '../state/actions';

export function NewPageMenu() {
  const doc = useDoc();
  const menu = useUI((s) => s.newMenu);
  const projectId = useUI((s) => s.projectId);
  const set = useUI((s) => s.set);

  if (!menu) return null;
  const schema = schemaFor(doc, projectId);
  const board = doc.boards.find((b) => b.id === menu.boardId);
  const close = () => set({ newMenu: null });

  const pick = (type: string) => {
    close();
    promptNew({ kind: 'page', initial: suggestPageName(type), boardId: menu.boardId, type });
  };

  return (
    <>
      <div className="catcher" onClick={close} />
      <div className="new-menu" style={{ left: Math.max(8, menu.left), top: menu.top }}>
        <div className="popover__head">NEW PAGE / ON {(board?.name ?? '').toUpperCase()}</div>

        <button className="opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick('blank')}>
          <span className="opt__code" style={{ ['--tint' as string]: 'var(--accent)' }}>BL</span>
          <span className="opt__stack">
            <span className="opt__label">Blank page</span>
            <span className="opt__sub">Add your own elements, labels and layout</span>
          </span>
        </button>

        {creatableTypeKeys(schema).map((key) => {
            const type = blockType(schema, key);
            const sub = type.fields.length
              ? type.fields.slice(0, 4).map((f) => f.label).join(' · ')
              : 'No preset fields';
            return (
              <button
                key={key}
                className="opt"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(key)}
              >
                <span className="opt__code" style={{ ['--tint' as string]: type.color }}>{type.code}</span>
                <span className="opt__stack">
                  <span className="opt__label">{type.label}</span>
                  <span className="opt__sub truncate">{sub}</span>
                </span>
              </button>
            );
        })}
      </div>
    </>
  );
}
