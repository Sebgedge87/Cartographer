import { loadAssets, assetUrl } from './assets';

export type Theme = 'dark' | 'light' | 'parchment';
export const THEMES: Theme[] = ['dark', 'light', 'parchment'];

const THEME_KEY = 'cartographer.theme';
const SHEET_KEY = 'cartographer.parchment';

/**
 * A procedural sheet, so the parchment theme works before anyone supplies a picture.
 * Fibres and blotches from two turbulence passes — no file to ship, and it tiles at
 * any size because it is drawn rather than photographed.
 */
const FALLBACK_SHEET =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E" +
  "%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E" +
  "%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E" +
  "%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3'/%3E" +
  "%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E" +
  "%3Crect width='600' height='600' fill='%23d8bd8e'/%3E" +
  // Big soft blotches first, then fine fibres over them: aged paper is mottled at
  // both scales, and either one alone reads as noise rather than as a sheet.
  "%3Crect width='600' height='600' filter='url(%23b)' opacity='0.55'/%3E" +
  "%3Crect width='600' height='600' filter='url(%23f)' opacity='0.16'/%3E" +
  // A warm vignette, so the ground is not evenly lit like a screen.
  "%3Cradialgradient id='v' cx='50%25' cy='42%25' r='78%25'%3E" +
  "%3Cstop offset='55%25' stop-color='%23ffffff' stop-opacity='0.22'/%3E" +
  "%3Cstop offset='100%25' stop-color='%236b4a1e' stop-opacity='0.30'/%3E%3C/radialgradient%3E" +
  "%3Crect width='600' height='600' fill='url(%23v)'/%3E%3C/svg%3E\")";

/** Read the stored theme. Anything unrecognised falls back to dark. */
export function storedTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return THEMES.includes(raw as Theme) ? (raw as Theme) : 'dark';
  } catch {
    return 'dark';
  }
}

/** The asset id of a supplied sheet, or null for the built-in one. */
export function storedSheet(): string | null {
  try {
    return localStorage.getItem(SHEET_KEY);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode; the theme just will not survive a reload */
  }
}

/** Put the sheet on the page. Falls back to the drawn one when nothing is stored. */
export async function applySheet(assetId: string | null): Promise<void> {
  let image = FALLBACK_SHEET;
  if (assetId) {
    await loadAssets([assetId]);
    const url = assetUrl(assetId);
    if (url) image = `url("${url}")`;
  }
  document.documentElement.style.setProperty('--page-image', image);
}

/**
 * Set the theme on the root element, where the token file is watching for it, and
 * remember it. Called before the first paint as well as from the settings menu.
 */
export function applyTheme(theme: Theme, sheet: string | null = storedSheet()): void {
  document.documentElement.dataset.theme = theme;
  write(THEME_KEY, theme);
  if (theme === 'parchment') void applySheet(sheet);
}

export function rememberSheet(assetId: string | null): void {
  write(SHEET_KEY, assetId);
  void applySheet(assetId);
}
