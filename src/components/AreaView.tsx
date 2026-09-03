import { blockType, schemaFor, useDoc } from '../state/docStore';
import { useUI } from '../state/uiStore';
import { promptNew } from '../state/actions';

/**
 * What you see when an area is selected: the boards it holds. An area has no canvas
 * of its own — pages live on boards, so this is a way in rather than a workspace.
 */
export function AreaView() {
  const doc = useDoc();
  const projectId = useUI((s) => s.projectId);
  const areaId = useUI((s) => s.areaId);
  const openBoard = useUI((s) => s.openBoard);
  const set = useUI((s) => s.set);

  const area = doc.areas.find((a) => a.id === areaId);
  if (!area) return null;

  const schema = schemaFor(doc, projectId);
  const defaultType = blockType(schema, area.defaultType);
  const boards = doc.boards.filter((b) => b.areaId === area.id);

  return (
    <div className="area-view">
      <div className="area-view__inner">
        <header className="area-view__head">
          <div>
            <div className="area-view__kicker">AREA</div>
            <h1 className="area-view__title">{area.name}</h1>
            <p className="area-view__desc">
              {boards.length === 0
                ? 'No boards yet. A board is one subject — a single NPC, a location, one rule.'
                : `${boards.length} board${boards.length === 1 ? '' : 's'}. Pages live on boards, not here.`}
            </p>
          </div>
          <div className="spacer" />
          <div className="area-view__default">
            <span className="label">New pages default to</span>
            <select
              className="field field--mono"
              value={area.defaultType}
              onChange={(e) => doc.setAreaDefaultType(area.id, e.target.value)}
            >
              {schema.typeOrder
                .filter((k) => schema.types[k] && (!schema.types[k]!.hidden || k === area.defaultType))
                .map((k) => (
                  <option key={k} value={k}>{blockType(schema, k).label}</option>
                ))}
            </select>
          </div>
        </header>

        <div className="area-view__grid">
          {boards.map((board) => {
            const pages = doc.pages.filter((p) => p.boardId === board.id);
            const ids = new Set(pages.map((p) => p.id));
            const links = doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).length;
            return (
              <button
                key={board.id}
                className="board-tile"
                style={{ ['--tint' as string]: defaultType.color }}
                onClick={() => openBoard(board.id, area.id)}
                onDoubleClick={() => set({ renamingBoard: board.id })}
              >
                <span className="board-tile__grid" />
                <span className="board-tile__name truncate">{board.name}</span>
                <span className="board-tile__stats">
                  <span>{pages.length} PAGES</span>
                  <span>{links} LINKS</span>
                </span>
              </button>
            );
          })}

          <button className="board-tile board-tile--new" onClick={() => promptNew({ kind: 'board', initial: 'New board', areaId: area.id })}>
            + NEW BOARD
          </button>
        </div>
      </div>
    </div>
  );
}
