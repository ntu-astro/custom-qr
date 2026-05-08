import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  reducer,
  getInitialState,
  PERSIST_KEY,
  type AppState,
  type CustomSource,
} from './appReducer';
import { DEFAULT_TEMPLATE_ID } from './templates/presets';
import type { PosterSize } from './types';

/**
 * jsdom's `localStorage` exists as an object in this vitest config but its
 * Storage methods (getItem/setItem/clear) are not wired up — see the
 * `--localstorage-file` warning at vitest startup. We install a minimal
 * in-memory shim for these tests so we can exercise the rehydration paths.
 */
type StorageLike = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
};

let store: Map<string, string>;
let originalLocalStorage: Storage | undefined;

beforeAll(() => {
  originalLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  store = new Map();
  const shim: StorageLike = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: shim,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: originalLocalStorage,
  });
});

const baseState: AppState = {
  url: 'https://example.com',
  templateId: 'orion',
  customSource: null,
  caption: 'caption text',
  posterSize: { kind: 'igPost', width: 1080, height: 1080 },
  multiSize: false,
  silhouetteScale: 1,
  renderMode: 'halftone',
};

describe('PERSIST_KEY', () => {
  it('is a string starting with "astro-qr:" (sanity guard against rename)', () => {
    expect(typeof PERSIST_KEY).toBe('string');
    expect(PERSIST_KEY.startsWith('astro-qr:')).toBe(true);
  });
});

describe('getInitialState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns DEFAULT_STATE when localStorage has no value at PERSIST_KEY', () => {
    const state = getInitialState();
    expect(state.url).toBe('');
    expect(state.templateId).toBe(DEFAULT_TEMPLATE_ID);
    expect(state.customSource).toBeNull();
    expect(state.caption).toBe('');
    expect(state.posterSize).toEqual({ kind: 'igPost', width: 1080, height: 1080 });
    expect(state.multiSize).toBe(false);
    expect(state.silhouetteScale).toBe(1);
  });

  it('returns DEFAULT_STATE when localStorage value is malformed JSON', () => {
    localStorage.setItem(PERSIST_KEY, '{not-json');
    const state = getInitialState();
    expect(state.url).toBe('');
    expect(state.templateId).toBe(DEFAULT_TEMPLATE_ID);
    expect(state.caption).toBe('');
  });

  it('rehydrates url, templateId, and caption when all three are valid strings', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        url: 'https://example.com/path',
        templateId: 'crux',
        caption: 'hello world',
      }),
    );
    const state = getInitialState();
    expect(state.url).toBe('https://example.com/path');
    expect(state.templateId).toBe('crux');
    expect(state.caption).toBe('hello world');
    // Other fields untouched.
    expect(state.customSource).toBeNull();
    expect(state.multiSize).toBe(false);
    expect(state.silhouetteScale).toBe(1);
  });

  it('ignores non-string url field and keeps the default', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ url: 123, templateId: 'orion', caption: 'ok' }),
    );
    const state = getInitialState();
    expect(state.url).toBe('');
    expect(state.templateId).toBe('orion');
    expect(state.caption).toBe('ok');
  });

  it('ignores non-string templateId and caption fields', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        url: 'https://example.com',
        templateId: { not: 'a string' },
        caption: ['nope'],
      }),
    );
    const state = getInitialState();
    expect(state.url).toBe('https://example.com');
    expect(state.templateId).toBe(DEFAULT_TEMPLATE_ID);
    expect(state.caption).toBe('');
  });

  it('does NOT rehydrate fields outside the allowlist (e.g. customSource)', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        url: 'https://example.com',
        templateId: 'orion',
        caption: 'ok',
        customSource: { dataUrl: 'data:image/png;base64,XXXX', filename: 'x.png' },
        posterSize: { kind: 'igStory', width: 1080, height: 1920 },
        multiSize: true,
        silhouetteScale: 0.5,
      }),
    );
    const state = getInitialState();
    expect(state.customSource).toBeNull();
    expect(state.posterSize).toEqual({ kind: 'igPost', width: 1080, height: 1080 });
    expect(state.multiSize).toBe(false);
    expect(state.silhouetteScale).toBe(1);
  });
});

describe('reducer', () => {
  it('SET_URL — updates url and leaves other state intact (immutable)', () => {
    const next = reducer(baseState, { type: 'SET_URL', value: 'https://new.example.com' });
    expect(next).not.toBe(baseState);
    expect(next.url).toBe('https://new.example.com');
    expect(next.templateId).toBe(baseState.templateId);
    expect(next.caption).toBe(baseState.caption);
    expect(next.customSource).toBe(baseState.customSource);
    expect(next.posterSize).toBe(baseState.posterSize);
    expect(next.multiSize).toBe(baseState.multiSize);
  });

  it('SELECT_TEMPLATE — to a non-custom id sets templateId AND clears customSource', () => {
    const stateWithCustom: AppState = {
      ...baseState,
      templateId: 'custom',
      customSource: { dataUrl: 'data:image/png;base64,X', filename: 'x.png' },
    };
    const next = reducer(stateWithCustom, { type: 'SELECT_TEMPLATE', id: 'crux' });
    expect(next).not.toBe(stateWithCustom);
    expect(next.templateId).toBe('crux');
    expect(next.customSource).toBeNull();
  });

  it("SELECT_TEMPLATE — to 'custom' KEEPS customSource (does not null it)", () => {
    const customSource: CustomSource = { dataUrl: 'data:image/png;base64,X', filename: 'x.png' };
    const stateWithCustom: AppState = {
      ...baseState,
      templateId: 'orion',
      customSource,
    };
    const next = reducer(stateWithCustom, { type: 'SELECT_TEMPLATE', id: 'custom' });
    expect(next).not.toBe(stateWithCustom);
    expect(next.templateId).toBe('custom');
    expect(next.customSource).toBe(customSource);
  });

  it("SET_CUSTOM_SOURCE — sets templateId='custom' AND assigns customSource", () => {
    const source: CustomSource = { dataUrl: 'data:image/png;base64,Y', filename: 'y.png' };
    const next = reducer(baseState, { type: 'SET_CUSTOM_SOURCE', source });
    expect(next).not.toBe(baseState);
    expect(next.templateId).toBe('custom');
    expect(next.customSource).toBe(source);
    // Other state preserved.
    expect(next.url).toBe(baseState.url);
    expect(next.caption).toBe(baseState.caption);
  });

  it('CLEAR_CUSTOM_SOURCE — resets templateId to DEFAULT_TEMPLATE_ID AND nulls customSource', () => {
    const stateWithCustom: AppState = {
      ...baseState,
      templateId: 'custom',
      customSource: { dataUrl: 'data:image/png;base64,X', filename: 'x.png' },
    };
    const next = reducer(stateWithCustom, { type: 'CLEAR_CUSTOM_SOURCE' });
    expect(next).not.toBe(stateWithCustom);
    expect(next.templateId).toBe(DEFAULT_TEMPLATE_ID);
    expect(next.customSource).toBeNull();
  });

  it('SET_CAPTION — updates caption only', () => {
    const next = reducer(baseState, { type: 'SET_CAPTION', value: 'new caption' });
    expect(next).not.toBe(baseState);
    expect(next.caption).toBe('new caption');
    expect(next.url).toBe(baseState.url);
    expect(next.templateId).toBe(baseState.templateId);
  });

  it('SET_POSTER_SIZE — updates posterSize only', () => {
    const newSize: PosterSize = { kind: 'igStory', width: 1080, height: 1920 };
    const next = reducer(baseState, { type: 'SET_POSTER_SIZE', size: newSize });
    expect(next).not.toBe(baseState);
    expect(next.posterSize).toBe(newSize);
    expect(next.url).toBe(baseState.url);
    expect(next.caption).toBe(baseState.caption);
  });

  it('PATCH_ADVANCED — merges the patch into state (multiSize)', () => {
    const next = reducer(baseState, { type: 'PATCH_ADVANCED', patch: { multiSize: true } });
    expect(next).not.toBe(baseState);
    expect(next.multiSize).toBe(true);
    expect(next.silhouetteScale).toBe(baseState.silhouetteScale);
  });

  it('PATCH_ADVANCED — merges the patch into state (silhouetteScale)', () => {
    const next = reducer(baseState, { type: 'PATCH_ADVANCED', patch: { silhouetteScale: 0.5 } });
    expect(next).not.toBe(baseState);
    expect(next.silhouetteScale).toBe(0.5);
    expect(next.multiSize).toBe(baseState.multiSize);
  });

  it('PATCH_ADVANCED — merges multiple advanced fields at once', () => {
    const next = reducer(baseState, {
      type: 'PATCH_ADVANCED',
      patch: { multiSize: true, silhouetteScale: 0.7 },
    });
    expect(next).not.toBe(baseState);
    expect(next.multiSize).toBe(true);
    expect(next.silhouetteScale).toBe(0.7);
  });
});
