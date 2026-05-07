import type { PosterSize } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';

export interface CustomSource {
  dataUrl: string;
  filename: string;
}

export interface AppState {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  caption: string;
  posterSize: PosterSize;
  multiSize: boolean;
  background: string;
  /** 0.3..1 — fraction of the QR canvas covered by the silhouette. */
  silhouetteScale: number;
}

export type AppAction =
  | { type: 'SET_URL'; value: string }
  | { type: 'SELECT_TEMPLATE'; id: string }
  | { type: 'SET_CUSTOM_SOURCE'; source: CustomSource }
  | { type: 'CLEAR_CUSTOM_SOURCE' }
  | { type: 'SET_CAPTION'; value: string }
  | { type: 'SET_POSTER_SIZE'; size: PosterSize }
  | {
      type: 'PATCH_ADVANCED';
      patch: Partial<{
        multiSize: boolean;
        background: string;
        silhouetteScale: number;
      }>;
    };

export const initialState: AppState = {
  url: '',
  templateId: DEFAULT_TEMPLATE_ID,
  customSource: null,
  caption: '',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  multiSize: false,
  background: 'transparent',
  silhouetteScale: 1,
};

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

export function effectiveUrl(state: AppState): string {
  return state.url.trim() || DEFAULT_PLACEHOLDER_URL;
}
