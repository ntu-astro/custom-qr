import type { PosterSize, RenderMode } from './types';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';

export interface CustomSource {
  dataUrl: string;
  filename: string;
}

export interface AdvancedSettings {
  multiSize: boolean;
  /** 0.3..1 — fraction of the QR canvas covered by the silhouette. */
  silhouetteScale: number;
  /** 'halftone' (default, Chu et al. 2013) | 'composite' (qart.js-style). */
  renderMode: RenderMode;
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
  renderMode: 'halftone',
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
 *  defaults to avoid persisting potentially huge `customSource` data URLs and
 *  to keep transient layout state from leaking across reloads. */
export function getInitialState(): AppState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed: PersistedState = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(typeof parsed.templateId === 'string' ? { templateId: parsed.templateId } : {}),
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
      };
    case 'SET_CUSTOM_SOURCE':
      return { ...state, templateId: 'custom', customSource: action.source };
    case 'CLEAR_CUSTOM_SOURCE':
      return { ...state, templateId: DEFAULT_TEMPLATE_ID, customSource: null };
    case 'SET_CAPTION':
      return { ...state, caption: action.value };
    case 'SET_POSTER_SIZE':
      return { ...state, posterSize: action.size };
    case 'PATCH_ADVANCED':
      return { ...state, ...action.patch };
  }
}
