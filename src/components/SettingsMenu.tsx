import { useCallback, useRef, useState } from 'react';
import { useDismiss } from '../lib/useDismiss';
import type { ViewMode } from '../state/types';
import { useUI, type Density, type GridStyle } from '../state/uiStore';
import { useSync } from '../state/syncStore';
import { exportCurrentProject } from '../state/actions';
import { signOut } from '../state/sync/auth';
import { syncNow } from '../state/sync/engine';
import { importImage } from '../lib/assets';
import type { Theme } from '../lib/theme';

const GRIDS: { value: GridStyle; label: string }[] = [
  { value: 'blueprint', label: 'BLUEPRINT' },
  { value: 'dots', label: 'DOTS' },
  { value: 'none', label: 'NONE' },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'dense', label: 'DENSE' },
  { value: 'comfortable', label: 'ROOMY' },
];

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: 'area', label: 'AREA' },
  { value: 'board', label: 'BOARD' },
  { value: 'table', label: 'PAGES' },
  { value: 'timeline', label: 'TIME' },
  { value: 'schema', label: 'SCHEMA' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'DARK' },
  { value: 'light', label: 'LIGHT' },
  { value: 'parchment', label: 'PAPER' },
];

const SYNC_LABEL: Record<string, string> = {
  off: 'Local only — no sync configured',
  'signed-out': 'Local only — not signed in',
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  synced: 'Synced',
  error: 'Sync failed',
};

/**
 * Everything the top bar used to spend width on. Appearance settings that already
 * existed in the store but had no control anywhere now live here too.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const mode = useUI((s) => s.mode);
  const grid = useUI((s) => s.grid);
  const density = useUI((s) => s.density);
  const showInspector = useUI((s) => s.showInspector);
  const theme = useUI((s) => s.theme);
  const sheet = useUI((s) => s.sheet);
  const setTheme = useUI((s) => s.setTheme);
  const setSheet = useUI((s) => s.setSheet);
  const showToast = useUI((s) => s.showToast);
  const sheetPicker = useRef<HTMLInputElement>(null);
  const set = useUI((s) => s.set);
  const goHome = useUI((s) => s.goHome);

  const status = useSync((s) => s.status);
  const email = useSync((s) => s.email);
  const error = useSync((s) => s.error);
  const setSync = useSync((s) => s.set);

  const wrap = useRef<HTMLDivElement>(null);

  // Close on Escape or on a click outside. A full-screen catcher would sit over the
  // button that opened the panel, leaving it unable to close itself.

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, wrap, close);

  return (
    <div className="settings" ref={wrap}>
      <button
        className={'settings__button' + (open ? ' settings__button--open' : '')}
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen(!open)}
      >
        <span className={`settings__dot settings__dot--${status}`} />
        SETTINGS
      </button>

      {open && (
        <div className="settings__panel">

            <div className="settings__group">
              <div className="settings__label">View</div>
              <div className="settings__row">
                <span>Showing</span>
                <div className="segments">
                  {VIEWS.map((v) => (
                    <button
                      key={v.value}
                      className="segment"
                      aria-pressed={mode === v.value}
                      // Switching view is navigation, not a setting — get out of the way.
                      onClick={() => { close(); set({ mode: v.value }); }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings__group">
              <div className="settings__label">Theme</div>
              <div className="settings__row">
                <span>Ground</span>
                <div className="segments">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      className="segment"
                      aria-pressed={theme === t.value}
                      onClick={() => setTheme(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {theme === 'parchment' && (
                <>
                  <div className="settings__row">
                    <span>Sheet</span>
                    <div className="segments">
                      <button className="segment" onClick={() => sheetPicker.current?.click()}>
                        {sheet ? 'REPLACE' : 'USE AN IMAGE'}
                      </button>
                      {sheet && (
                        <button className="segment" onClick={() => setSheet(null)}>
                          DRAWN
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="settings__hint">
                    Your own paper, behind the whole app. Anything without a strong pattern reads
                    best — the text sits directly on it.
                  </div>
                  <input
                    ref={sheetPicker}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const result = await importImage(file);
                      if (result.ok) {
                        setSheet(result.image.id);
                        showToast('Sheet set');
                      } else {
                        showToast(result.reason);
                      }
                    }}
                  />
                </>
              )}
            </div>

            <div className="settings__group">
              <div className="settings__label">Board</div>

              <div className="settings__row">
                <span>Grid</span>
                <div className="segments">
                  {GRIDS.map((g) => (
                    <button
                      key={g.value}
                      className="segment"
                      aria-pressed={grid === g.value}
                      onClick={() => set({ grid: g.value })}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings__row">
                <span>Rail density</span>
                <div className="segments">
                  {DENSITIES.map((d) => (
                    <button
                      key={d.value}
                      className="segment"
                      aria-pressed={density === d.value}
                      onClick={() => set({ density: d.value })}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings__row">
                <span>Inspector</span>
                <div className="segments">
                  <button
                    className="segment"
                    aria-pressed={showInspector}
                    onClick={() => set({ showInspector: true })}
                  >
                    SHOWN
                  </button>
                  <button
                    className="segment"
                    aria-pressed={!showInspector}
                    onClick={() => set({ showInspector: false })}
                  >
                    HIDDEN
                  </button>
                </div>
              </div>
            </div>

            <div className="settings__group">
              <div className="settings__label">Project</div>
              <button className="settings__item" onClick={() => { close(); exportCurrentProject(); }}>
                Export as JSON
              </button>
              <button className="settings__item" onClick={() => { close(); goHome(); }}>
                All projects
              </button>
            </div>

            <div className="settings__group settings__group--last">
              <div className="settings__label">Sync</div>
              <div className="settings__status">
                <span className={`settings__dot settings__dot--${status}`} />
                <span>{status === 'error' ? (error ?? 'Sync failed') : SYNC_LABEL[status] ?? 'Local only'}</span>
              </div>
              {email && <div className="settings__email">{email}</div>}

              {status === 'signed-out' && (
                <button
                  className="settings__item"
                  onClick={() => { close(); setSync({ offlineChosen: false }); }}
                >
                  Sign in to sync
                </button>
              )}
              {(status === 'synced' || status === 'error') && (
                <button className="settings__item" onClick={() => { close(); void syncNow(); }}>
                  Sync now
                </button>
              )}
              {email && (
                <button className="settings__item" onClick={() => { close(); void signOut(); }}>
                  Sign out
                </button>
              )}
            </div>

        </div>
      )}
    </div>
  );
}
