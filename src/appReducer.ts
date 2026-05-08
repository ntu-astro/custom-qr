import type { FilterMode, PosterSize, RenderMode } from './types';
import { DEFAULT_TEMPLATE_ID, findTemplate } from './templates/presets';

/** Picks the per-template default filter mode. Astronomy presets are pure-black
 *  silhouettes that look best collapsed to a single tone (`'mono'`); art and
 *  custom uploads are full-colour images that lose all character if mono-ed,
 *  so they default to `'color'`. The user can override via the toggle in
 *  Advanced options; this default is only applied on template selection. */
function defaultFilterFor(templateId: string): FilterMode {
  if (templateId === 'custom') return 'color';
  return findTemplate(templateId).category === 'astronomy' ? 'mono' : 'color';
}

export interface CustomSource {
  /** SHA-256 content hash of the uploaded data URL. The actual data URL
   *  lives in the in-memory cache (`src/lib/imageCache.ts`); reducer state
   *  only carries this small, stable identifier. */
  imageHash: string;
  filename: string;
  /** When true, the upload pipeline centre-crops the source to a square that
   *  fills the QR canvas (no transparent letterbox gutters). When false /
   *  unset (default), the source is letterboxed and gutter modules render as
   *  regular QR squares. */
  cropToSquare?: boolean;
}

export interface AdvancedSettings {
  multiSize: boolean;
  /** 0.3..1 — fraction of the QR canvas covered by the silhouette. */
  silhouetteScale: number;
  /** 'composite' (default, qart.js-style) | 'halftone' (Chu et al. 2013). */
  renderMode: RenderMode;
  /** 'color' (default) samples ink per-pixel from the source image; 'mono'
   *  collapses the silhouette to its dominant tone. */
  filter: FilterMode;
}

export interface AppState extends AdvancedSettings {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  caption: string;
  posterSize: PosterSize;
}

export type AppAction =
  | { type: 'SET_URL'; value: string }
  | { type: 'SELECT_TEMPLATE'; id: string }
  | { type: 'SET_CUSTOM_SOURCE'; source: CustomSource }
  | { type: 'CLEAR_CUSTOM_SOURCE' }
  | { type: 'SET_CAPTION'; value: string }
  | { type: 'SET_POSTER_SIZE'; size: PosterSize }
  | { type: 'PATCH_ADVANCED'; patch: Partial<AdvancedSettings> };

const DEFAULT_STATE: AppState = {
  url: '',
  templateId: DEFAULT_TEMPLATE_ID,
  customSource: null,
  caption: '',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  multiSize: false,
  silhouetteScale: 1,
  renderMode: 'composite',
  filter: defaultFilterFor(DEFAULT_TEMPLATE_ID),
};

/** Versioned localStorage key. Bump the suffix to invalidate persisted state. */
export const PERSIST_KEY = 'astro-qr:v1';

interface PersistedState {
  url?: unknown;
  templateId?: unknown;
  caption?: unknown;
}

/** Lazy initial state for `useReducer`. Defaults are returned silently on any
 *  parse, schema, or storage error (private mode, quota, malformed JSON). Only
 *  `url`, `templateId`, and `caption` are rehydrated; other fields stay at
 *  defaults. We deliberately do NOT persist `customSource` even though it now
 *  carries only a small hash: the image cache (`src/lib/imageCache.ts`) is
 *  in-memory only, so a rehydrated hash would point at a nonexistent entry on
 *  next load. Other transient layout state is also kept out to avoid leaking
 *  across reloads. */
export function getInitialState(): AppState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed: PersistedState = JSON.parse(raw);
    // Only adopt a persisted templateId that still resolves to a known preset
    // (or 'custom'); silently fall back otherwise. This keeps `filter` in sync
    // with `defaultFilterFor(templateId)` — without it, refreshing on an art
    // template restores templateId='…' but filter='mono' (the astronomy
    // default for the unrelated DEFAULT_TEMPLATE_ID), which renders the
    // art piece monochrome until the user re-clicks the tile.
    let templateId = DEFAULT_STATE.templateId;
    if (typeof parsed.templateId === 'string') {
      if (parsed.templateId === 'custom') {
        // 'custom' tab without a customSource has no meaningful render; the
        // image cache is in-memory and will miss after refresh anyway.
        templateId = DEFAULT_STATE.templateId;
      } else {
        try {
          findTemplate(parsed.templateId);
          templateId = parsed.templateId;
        } catch {
          /* unknown id — keep default */
        }
      }
    }
    return {
      ...DEFAULT_STATE,
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      templateId,
      filter: defaultFilterFor(templateId),
      ...(typeof parsed.caption === 'string' ? { caption: parsed.caption } : {}),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, url: action.value };
    case 'SELECT_TEMPLATE':
      return {
        ...state,
        templateId: action.id,
        customSource: action.id === 'custom' ? state.customSource : null,
        filter: defaultFilterFor(action.id),
      };
    case 'SET_CUSTOM_SOURCE':
      return {
        ...state,
        templateId: 'custom',
        customSource: action.source,
        filter: 'color',
      };
    case 'CLEAR_CUSTOM_SOURCE':
      return {
        ...state,
        templateId: DEFAULT_TEMPLATE_ID,
        customSource: null,
        filter: defaultFilterFor(DEFAULT_TEMPLATE_ID),
      };
    case 'SET_CAPTION':
      return { ...state, caption: action.value };
    case 'SET_POSTER_SIZE':
      return { ...state, posterSize: action.size };
    case 'PATCH_ADVANCED':
      return { ...state, ...action.patch };
  }
}
