import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootDoc } from './state/docStore';
import './styles/tokens.css';
import './styles/app.css';

const root = createRoot(document.getElementById('root')!);

// Documents load from IndexedDB (seeded on first run) before the first paint, so the
// board is never briefly empty.
void bootDoc().then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
