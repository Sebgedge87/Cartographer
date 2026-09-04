import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootDoc } from './state/docStore';
import { watchAuth } from './state/sync/auth';
import { applyTheme, storedTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/app.css';

// Before anything renders, so the app never flashes the wrong ground on the way in.
applyTheme(storedTheme());

const root = createRoot(document.getElementById('root')!);

// Documents load from IndexedDB before the first paint, so the board never flashes
// empty on the way in.
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
