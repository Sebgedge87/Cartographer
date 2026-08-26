import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';

/**
 * Implementation order (see design/SPEC.md):
 *   1. store + persistence + <Home />
 *   2. <ProjectShell />: top bar, <PagesRail />, <Inspector />
 *   3. <Board />: camera, <PageCard />, port linking, <Edges />
 *   4. <PageEditor />: format bar, markdown preview, slash + wikilink popovers
 *   5. <SchemaEditor />, per-page custom layouts, promote-to-type
 *   6. import/export, then the Tauri wrapper
 */
function App() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', maxWidth: '46ch', padding: 24 }}>
        <div
          style={{
            font: "700 10px var(--font-mono)",
            letterSpacing: '.28em',
            color: 'var(--dim)',
          }}
        >
          CARTOGRAPHER
        </div>
        <h1 style={{ margin: '12px 0 8px', font: "600 32px/1.1 var(--font-ui)", letterSpacing: '-.03em' }}>
          Scaffold ready
        </h1>
        <p style={{ margin: 0, font: "400 14px/1.6 var(--font-ui)", color: 'var(--muted)', textWrap: 'pretty' }}>
          Build against <code>design/SPEC.md</code> and the reference prototype in{' '}
          <code>design/cartographer-standalone.html</code>. The document model and board
          maths are already typed in <code>src/state/</code>.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
