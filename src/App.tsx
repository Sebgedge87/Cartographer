import { useEffect } from 'react';
import { useDoc } from './state/docStore';
import { useUI } from './state/uiStore';
import { promptNew, suggestPageName } from './state/actions';
import { Home } from './components/Home';
import { TopBar } from './components/TopBar';
import { PagesRail } from './components/PagesRail';
import { Board } from './components/Board';
import { AreaView } from './components/AreaView';
import { PagesTable } from './components/PagesTable';
import { SchemaEditor } from './components/SchemaEditor';
import { Inspector } from './components/Inspector';
import { PageEditor } from './components/PageEditor';
import { NewPageMenu } from './components/NewPageMenu';
import { Toast } from './components/Toast';
import { ContextMenu } from './components/ContextMenu';
import { NamePrompt } from './components/NamePrompt';
import { SignIn } from './components/SignIn';
import { useSync } from './state/syncStore';

function isTyping(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/** Global shortcuts. Esc unwinds popover → editor → palette, in that order. */
function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        const history = useDoc.temporal.getState();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (e.key === 'Escape') {
        if (ui.prompt) return ui.set({ prompt: null });
        if (ui.context) return ui.set({ context: null });
        if (ui.newMenu) return ui.set({ newMenu: null });
        if (ui.menu) return ui.set({ menu: null });
        if (ui.editing) return ui.closeEditor();
        return;
      }
      if (isTyping(e.target)) return;
      if (ui.view === 'project' && !ui.editing && !ui.prompt && ui.boardId && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        promptNew({ kind: 'page', initial: suggestPageName(), boardId: ui.boardId });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const view = useUI((s) => s.view);
  const mode = useUI((s) => s.mode);
  const showInspector = useUI((s) => s.showInspector);
  const syncStatus = useSync((s) => s.status);
  const offlineChosen = useSync((s) => s.offlineChosen);
  const setSync = useSync((s) => s.set);
  useGlobalKeys();

  if (syncStatus === 'signed-out' && !offlineChosen) {
    return <SignIn onSkip={() => setSync({ offlineChosen: true })} />;
  }

  return (
    <>
      {view === 'home' ? (
        <Home />
      ) : (
        <div className="shell">
          <TopBar />
          <div className="shell__body">
            <PagesRail />
            <div className="shell__main">
              {mode === 'area' && <AreaView />}
              {mode === 'board' && <Board />}
              {mode === 'table' && <PagesTable />}
              {mode === 'schema' && <SchemaEditor />}
            </div>
            {showInspector && mode !== 'schema' && mode !== 'area' && <Inspector />}
          </div>
          <PageEditor />
          <NewPageMenu />
        </div>
      )}
      <ContextMenu />
      <NamePrompt />
      <Toast />
    </>
  );
}
