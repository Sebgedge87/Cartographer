import { create } from 'zustand';
import type { Camera, ViewMode } from './types';
import { ZOOM_MAX, ZOOM_MIN } from './graph';
import { applyTheme, rememberSheet, storedSheet, storedTheme, type Theme } from '../lib/theme';

export type GridStyle = 'blueprint' | 'dots' | 'none';
export type Density = 'dense' | 'comfortable';

/** The `/` and `[[` popover in the page editor. */
export interface EditorMenu {
  kind: 'slash' | 'wiki';
  /** The partial word after the trigger. */
  q: string;
  /** How many characters before the caret the trigger occupies. */
  len: number;
  i: number;
}

/** What was right-clicked. `id` is the area/board/page; for canvas it is the board. */
export interface ContextTarget {
  /** 'app' is the fallback: right-clicked somewhere with nothing specific under it. */
  kind: 'project' | 'area' | 'board' | 'page' | 'canvas' | 'app';
  id: string;
  /** World point under the cursor, so "new page here" lands where you clicked. */
  world?: { x: number; y: number };
}

export interface ContextMenu {
  x: number;
  y: number;
  target: ContextTarget;
}

/** An in-flight "name this thing" modal. Everything needed to make it on submit. */
export interface NamePrompt {
  kind: 'area' | 'board' | 'page';
  initial: string;
  /** Where it goes. Areas need neither; boards need an area; pages need a board. */
  areaId?: string;
  boardId?: string;
  /** Block type for a page. */
  type?: string;
  /** World point for a page created at a specific spot on the canvas. */
  at?: { x: number; y: number };
}

export interface NewMenu {
  boardId: string;
  left: number;
  top: number;
}

const DEFAULT_CAM: Camera = { x: 260, y: 180, z: 1 };

/** One throw of the dice, handed to the tray to simulate. */
export interface DiceThrow {
  /** Distinguishes one throw from the next, so the tray remounts rather than reuses. */
  id: number;
  /** Dice notation the tray rolls, e.g. `2d6+3`. */
  notation: string;
  /**
   * Called once, with the values the dice actually came to rest on. The simulation
   * is the source of randomness here — nothing is decided in advance and then
   * performed — so the caller reports what this hands back.
   */
  onSettle: (rolls: number[], total: number) => void;
}

interface UIState {
  view: 'home' | 'project';
  projectId: string | null;
  areaId: string | null;
  /** The board whose canvas is open. Null while looking at an area. */
  boardId: string | null;
  mode: ViewMode;

  sel: string | null;
  editing: string | null;
  cam: Camera;

  /** Page id being dragged, or '__pan' while panning the board. */
  drag: string | null;
  /** Source page id of an in-progress port drag. */
  link: string | null;
  /** World point the in-progress link is following. */
  ghost: { x: number; y: number } | null;

  menu: EditorMenu | null;
  newMenu: NewMenu | null;
  context: ContextMenu | null;
  prompt: NamePrompt | null;
  toast: string | null;
  /** An in-flight dice roll, or null. Ephemeral by nature — never persisted. */
  tray: DiceThrow | null;

  search: string;
  collapsed: Record<string, boolean>;
  fieldsOpen: boolean;
  renamingArea: string | null;
  renamingBoard: string | null;
  renamingProject: boolean;

  grid: GridStyle;
  density: Density;
  showInspector: boolean;
  theme: Theme;
  /** Asset id of a supplied parchment sheet, or null for the drawn one. */
  sheet: string | null;
}

interface UIActions {
  set: <K extends keyof UIState>(patch: Pick<UIState, K> | Partial<UIState>) => void;
  /** Switch theme: writes it to the root element and remembers it, then to state. */
  setTheme: (theme: Theme) => void;
  /** Use this stored image as the parchment sheet; null goes back to the drawn one. */
  setSheet: (assetId: string | null) => void;
  openProject: (projectId: string, areaId: string | null, boardId: string | null) => void;
  openArea: (areaId: string) => void;
  openBoard: (boardId: string, areaId: string) => void;
  goHome: () => void;
  select: (pageId: string | null) => void;
  openPage: (pageId: string, boardId: string) => void;
  closeEditor: () => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (px: number, py: number, factor: number) => void;
  setCam: (cam: Camera) => void;
  toggleArea: (areaId: string) => void;
  showToast: (message: string) => void;
}

export type UIStore = UIState & UIActions;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUI = create<UIStore>()((set, get) => ({
  view: 'home',
  projectId: null,
  areaId: null,
  boardId: null,
  mode: 'board',
  sel: null,
  editing: null,
  cam: DEFAULT_CAM,
  drag: null,
  link: null,
  ghost: null,
  menu: null,
  newMenu: null,
  context: null,
  prompt: null,
  toast: null,
  tray: null,
  search: '',
  collapsed: {},
  fieldsOpen: true,
  renamingArea: null,
  renamingBoard: null,
  renamingProject: false,
  grid: 'blueprint',
  density: 'dense',
  showInspector: true,
  // Read from storage rather than defaulted: the theme is applied before the first
  // paint in main.tsx, and the store has to agree with what is already on screen.
  theme: storedTheme(),
  sheet: storedSheet(),

  set: (patch) => set(patch as Partial<UIState>),

  setTheme: (theme) => {
    applyTheme(theme, get().sheet);
    set({ theme });
  },

  setSheet: (assetId) => {
    rememberSheet(assetId);
    set({ sheet: assetId });
  },

  openProject: (projectId, areaId, boardId) =>
    set({
      view: 'project', projectId, areaId, boardId,
      mode: boardId ? 'board' : 'area',
      sel: null, editing: null, cam: DEFAULT_CAM, search: '',
    }),

  /** Opening an area shows the boards it holds; there is no canvas at this level. */
  openArea: (areaId) => set({ areaId, boardId: null, mode: 'area', sel: null }),

  openBoard: (boardId, areaId) =>
    set({ boardId, areaId, mode: 'board', sel: null, cam: DEFAULT_CAM }),

  goHome: () => set({ view: 'home', editing: null, sel: null, menu: null, search: '' }),

  select: (sel) => set({ sel }),

  openPage: (pageId, boardId) =>
    set({ editing: pageId, sel: pageId, boardId, mode: 'board', fieldsOpen: true, menu: null }),

  closeEditor: () => set({ editing: null, menu: null }),

  panBy: (dx, dy) => set((s) => ({ cam: { ...s.cam, x: s.cam.x + dx, y: s.cam.y + dy } })),

  zoomAt: (px, py, factor) =>
    set((s) => {
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.cam.z * factor));
      const k = z / s.cam.z;
      return { cam: { x: px - (px - s.cam.x) * k, y: py - (py - s.cam.y) * k, z } };
    }),

  setCam: (cam) => set({ cam }),

  toggleArea: (areaId) =>
    set((s) => ({ collapsed: { ...s.collapsed, [areaId]: !s.collapsed[areaId] } })),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
}));

export const DEFAULT_CAMERA = DEFAULT_CAM;
