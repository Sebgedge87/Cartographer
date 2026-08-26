import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootDoc } from './state/docStore';
import { watchAuth } from './state/sync/auth';
import './styles/tokens.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

// Documents load from IndexedDB (seeded on first run) before the first paint, so the
// board is never briefly empty.
void bootDoc().then(() => {
  // Local document first, then the network: the board renders from what is already
  // on this machine and reconciles once a session is known.
  watchAuth();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
