import { create } from 'zustand';
import type { Camera, ViewMode } from './types';
import { ZOOM_MAX, ZOOM_MIN } from './graph';

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

export interface NewMenu {
  areaId: string;
  left: number;
  top: number;
}

const DEFAULT_CAM: Camera = { x: 260, y: 180, z: 1 };

interface UIState {
  view: 'home' | 'project';
  projectId: string | null;
  areaId: string | null;
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
  toast: string | null;

  search: string;
  collapsed: Record<string, boolean>;
  fieldsOpen: boolean;
  newField: string;
  renamingArea: string | null;
  renamingProject: boolean;

  grid: GridStyle;
  density: Density;
  showInspector: boolean;
}

interface UIActions {
  set: <K extends keyof UIState>(patch: Pick<UIState, K> | Partial<UIState>) => void;
  openProject: (projectId: string, areaId: string | null) => void;
  goHome: () => void;
  select: (pageId: string | null) => void;
  openPage: (pageId: string, areaId: string) => void;
  closeEditor: () => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (px: number, py: number, factor: number) => void;
  setCam: (cam: Camera) => void;
  toggleArea: (areaId: string) => void;
  showToast: (message: string) => void;
}

export type UIStore = UIState & UIActions;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUI = create<UIStore>()((set) => ({
  view: 'home',
  projectId: null,
  areaId: null,
  mode: 'board',
  sel: null,
  editing: null,
  cam: DEFAULT_CAM,
  drag: null,
  link: null,
  ghost: null,
  menu: null,
  newMenu: null,
  toast: null,
  search: '',
  collapsed: {},
  fieldsOpen: true,
  newField: '',
  renamingArea: null,
  renamingProject: false,
  grid: 'blueprint',
  density: 'dense',
  showInspector: true,

  set: (patch) => set(patch as Partial<UIState>),

  openProject: (projectId, areaId) =>
    set({ view: 'project', projectId, areaId, mode: 'board', sel: null, editing: null, cam: DEFAULT_CAM, search: '' }),

  goHome: () => set({ view: 'home', editing: null, sel: null, menu: null, search: '' }),

  select: (sel) => set({ sel }),

  openPage: (pageId, areaId) => set({ editing: pageId, sel: pageId, areaId, fieldsOpen: true, menu: null }),

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
