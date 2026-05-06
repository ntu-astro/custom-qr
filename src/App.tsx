import { useReducer } from 'react';
import type { HalftoneStyle, PosterSize } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';

interface CustomSource {
  dataUrl: string;
  filename: string;
}

export interface AppState {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  caption: string;
  posterSize: PosterSize;
  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
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
        style: HalftoneStyle;
        density: number;
        marginPx: number;
        multiSize: boolean;
        background: string;
      }>;
    };

export const initialState: AppState = {
  url: '',
  templateId: DEFAULT_TEMPLATE_ID,
  customSource: null,
  caption: '',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  style: 'hybrid',
  density: 55,
  marginPx: 32,
  multiSize: false,
  background: 'transparent',
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

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
      <p className="text-olivegray mt-2">URL: {effectiveUrl(state)}</p>
      <button
        type="button"
        className="btn-primary mt-4"
        onClick={() => dispatch({ type: 'SET_URL', value: 'https://ntuastro.com/events' })}
      >
        Test reducer
      </button>
    </main>
  );
}
