import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useQrPipeline, type QrPipelineInput } from './useQrPipeline';
import type { CustomSource } from '../appReducer';

// TEST BOUNDARY: This file exercises the hook's ORCHESTRATION layer only —
// effect lifecycle, dep-array reactivity, error classification, race-fix
// (runIdRef) gating, and the lastGoodQrRef fallback. Every pipeline stage
// below is mocked at the module boundary so the assertions don't depend on
// halftone math.
//
// Real-pipeline coverage (the 48-case matrix across versions × render modes ×
// filters × sources × multiSize) lives in:
//   src/lib/pipelineIntegration.test.ts        ← functional matrix
//   src/lib/pipelineIntegration.perf.test.ts   ← perf gate (skipped on CI)
//
// If you find yourself wanting to assert on real pipeline output here, you
// probably want one of those files instead.

vi.mock('../lib/imageOps', () => ({
  loadImageData: vi.fn(async () => new ImageData(10, 10)),
}));

// The hook now consults the imageCache to resolve a CustomSource's hash to
// the actual data URL. Mock both functions: the cache lookup returns a fixed
// fake data URL so existing tests can keep asserting on what gets passed to
// loadImageData. The cache itself is exercised by src/lib/imageCache.test.ts.
vi.mock('../lib/imageCache', () => ({
  getCachedImageDataUrl: vi.fn(() => 'data:image/png;base64,IAMTHESOURCE'),
  cacheImageDataUrl: vi.fn(async () => 'fakehash'),
  clearImageCache: vi.fn(),
}));

vi.mock('../lib/qrMatrix', () => ({
  buildMatrix: vi.fn(() => ({
    size: 21,
    modules: Array.from({ length: 21 }, () => Array<boolean>(21).fill(false)),
    reserved: new Uint8Array(21 * 21),
  })),
}));

vi.mock('../lib/halftoneTarget', () => ({
  computeHalftoneTarget: vi.fn(() => ({
    size: 21,
    target: Array.from({ length: 21 }, () => Array<boolean>(21).fill(false)),
    importance: Array.from({ length: 21 }, () => Array<number>(21).fill(0)),
  })),
}));

vi.mock('../lib/maskOptimizer', () => ({
  pickBestMask: vi.fn(() => ({
    best: {
      maskPattern: 0,
      score: 0,
      matrix: {
        size: 21,
        modules: Array.from({ length: 21 }, () => Array<boolean>(21).fill(false)),
        reserved: new Uint8Array(21 * 21),
      },
    },
    scores: [],
  })),
}));

vi.mock('../lib/moduleFlipper', () => ({
  flipModulesByCodeword: vi.fn((matrix: { size: number; modules: boolean[][]; reserved: Uint8Array }) => ({
    matrix,
    report: { flipsPerBlock: [], modulesChanged: 0, perBlockBudget: 0 },
  })),
}));

// The hook dispatches renderers through the registry rather than calling
// `render(...)` directly, so we mock the registry façade and let the registry
// hand back stub renderers regardless of mode.
vi.mock('../lib/renderers', () => {
  const stubRender = vi.fn(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    return canvas;
  });
  const stubRenderer = { id: 'halftone' as const, render: stubRender };
  return {
    getRenderer: vi.fn(() => stubRenderer),
    RENDERERS: { halftone: stubRenderer, composite: { id: 'composite' as const, render: stubRender } },
  };
});

vi.mock('../lib/predictedCanvas', () => ({
  buildPredictedCanvas: vi.fn(() => ({
    data: new ImageData(63, 63),
    width: 63,
    height: 63,
    cellPx: 18,
    marginCells: 0,
    reservedChecksum: 0,
    raster: new ImageData(63, 63),
  })),
}));

vi.mock('../lib/scanVerifier', () => ({
  verify: vi.fn((_canvas: HTMLCanvasElement, sizes: number[]) =>
    sizes.map((s) => ({ ok: true, size: s, decoded: 'mock-decoded' })),
  ),
}));

// Pull mocked modules so we can read mock state inside tests.
import { loadImageData } from '../lib/imageOps';
import { buildMatrix } from '../lib/qrMatrix';
import { verify } from '../lib/scanVerifier';

const baseInput: QrPipelineInput = {
  url: 'https://example.com',
  templateId: 'ntuas',
  customSource: null,
  silhouetteScale: 1,
  multiSize: false,
  filter: 'mono',
  renderMode: 'halftone',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default success implementations — individual tests override.
  vi.mocked(loadImageData).mockResolvedValue(new ImageData(10, 10));
  vi.mocked(buildMatrix).mockReturnValue({
    size: 21,
    modules: Array.from({ length: 21 }, () => Array<boolean>(21).fill(false)),
    reserved: new Uint8Array(21 * 21),
  });
  vi.mocked(verify).mockImplementation((_canvas, sizes) =>
    sizes.map((s) => ({ ok: true, size: s, decoded: 'mock-decoded' })),
  );
});

describe('useQrPipeline — happy path', () => {
  it('produces a qrCanvas, scanResults, isRendering=false, no pipelineError', async () => {
    const { result } = renderHook(() => useQrPipeline(baseInput));

    await waitFor(() => {
      expect(result.current.isRendering).toBe(false);
      expect(result.current.qrCanvas).not.toBeNull();
    });

    expect(result.current.scanResults).toHaveLength(1);
    expect(result.current.scanResults[0].ok).toBe(true);
    expect(result.current.pipelineError).toBeUndefined();
    expect(result.current.qrCanvas?.width).toBe(100);
  });
});

describe('useQrPipeline — re-render on inputs', () => {
  it('rebuilds the matrix when url changes', async () => {
    const { result, rerender } = renderHook(
      (input: QrPipelineInput) => useQrPipeline(input),
      { initialProps: { ...baseInput, url: 'https://first.example.com' } },
    );

    await waitFor(() => expect(result.current.isRendering).toBe(false));
    const callsAfterFirst = vi.mocked(buildMatrix).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(buildMatrix).mock.calls.some((c) => c[0] === 'https://first.example.com')).toBe(true);

    rerender({ ...baseInput, url: 'https://second.example.com' });
    await waitFor(() =>
      expect(
        vi.mocked(buildMatrix).mock.calls.some((c) => c[0] === 'https://second.example.com'),
      ).toBe(true),
    );
    await waitFor(() => expect(result.current.isRendering).toBe(false));

    expect(vi.mocked(buildMatrix).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('does not rerun the pipeline when inputs are identical across renders', async () => {
    const { result, rerender } = renderHook(
      (input: QrPipelineInput) => useQrPipeline(input),
      { initialProps: { ...baseInput, url: 'https://stable.example.com' } },
    );

    await waitFor(() => expect(result.current.isRendering).toBe(false));
    const callsAfterFirst = vi.mocked(buildMatrix).mock.calls.length;

    // Same input object identity is a stricter guarantee than the dep array
    // requires, but it's enough to confirm the effect doesn't refire on a
    // no-op re-render.
    rerender({ ...baseInput, url: 'https://stable.example.com' });
    await waitFor(() => expect(result.current.isRendering).toBe(false));

    // The deps are primitives + the customSource reference — no change in any
    // primitive, customSource is null in both, so the effect should not refire.
    expect(vi.mocked(buildMatrix).mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('useQrPipeline — error handling', () => {
  it('surfaces loadImageData rejection in pipelineError and clears scanResults', async () => {
    vi.mocked(loadImageData).mockRejectedValueOnce(new Error('Failed to load image'));

    const { result } = renderHook(() => useQrPipeline(baseInput));

    await waitFor(() => expect(result.current.pipelineError).toBeDefined());
    expect(result.current.pipelineError).toBe('Failed to load image');
    expect(result.current.scanResults).toEqual([]);
    // First-time failure: lastGoodQrRef has never been populated, so qrCanvas
    // is the ref's initial null.
    expect(result.current.qrCanvas).toBeNull();
    expect(result.current.isRendering).toBe(false);
  });

  it('rewrites "too long" errors to a friendlier ECC message', async () => {
    vi.mocked(buildMatrix).mockImplementationOnce(() => {
      throw new Error('Data does not fit in version 40, ECC level H — too long');
    });

    const { result } = renderHook(() => useQrPipeline(baseInput));

    await waitFor(() => expect(result.current.pipelineError).toBeDefined());
    expect(result.current.pipelineError).toBe(
      'That URL is too long for QR error correction level H. Please shorten it.',
    );
    expect(result.current.isRendering).toBe(false);
  });

  it('preserves the last-good qrCanvas when a subsequent run fails', async () => {
    const { result, rerender } = renderHook(
      (input: QrPipelineInput) => useQrPipeline(input),
      { initialProps: { ...baseInput, url: 'https://good.example.com' } },
    );

    // First run succeeds.
    await waitFor(() => {
      expect(result.current.isRendering).toBe(false);
      expect(result.current.qrCanvas).not.toBeNull();
    });
    const goodCanvas = result.current.qrCanvas;
    expect(goodCanvas).not.toBeNull();

    // Now make loadImageData fail on the next run (changing url triggers it).
    vi.mocked(loadImageData).mockRejectedValueOnce(new Error('boom'));
    rerender({ ...baseInput, url: 'https://bad.example.com' });

    await waitFor(() => expect(result.current.pipelineError).toBe('boom'));
    expect(result.current.qrCanvas).toBe(goodCanvas);
    expect(result.current.scanResults).toEqual([]);
  });
});

describe('useQrPipeline — multiSize flag', () => {
  it('calls verify with [width, 200] when multiSize=true', async () => {
    const { result } = renderHook(() => useQrPipeline({ ...baseInput, multiSize: true }));

    await waitFor(() => expect(result.current.isRendering).toBe(false));

    const verifyCalls = vi.mocked(verify).mock.calls;
    expect(verifyCalls.length).toBeGreaterThan(0);
    const lastCall = verifyCalls[verifyCalls.length - 1];
    const sizes = lastCall[1];
    expect(sizes).toContain(200);
    expect(sizes.length).toBe(2);
  });

  it('calls verify with [width] when multiSize=false', async () => {
    const { result } = renderHook(() => useQrPipeline({ ...baseInput, multiSize: false }));

    await waitFor(() => expect(result.current.isRendering).toBe(false));

    const verifyCalls = vi.mocked(verify).mock.calls;
    expect(verifyCalls.length).toBeGreaterThan(0);
    const lastCall = verifyCalls[verifyCalls.length - 1];
    const sizes = lastCall[1];
    expect(sizes.length).toBe(1);
    expect(sizes).not.toContain(200);
  });
});

describe('useQrPipeline — template / customSource source path resolution', () => {
  it('passes the preset sourcePath to loadImageData when templateId is a preset', async () => {
    const { result } = renderHook(() =>
      useQrPipeline({ ...baseInput, templateId: 'ntuas', customSource: null }),
    );
    await waitFor(() => expect(result.current.isRendering).toBe(false));

    const calls = vi.mocked(loadImageData).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // ntuas preset path from src/templates/presets.ts
    expect(calls[calls.length - 1][0]).toBe('/templates/ntuas.svg');
  });

  it('passes the cached data URL (resolved via customSource.imageHash) to loadImageData when templateId is "custom"', async () => {
    const customSource: CustomSource = {
      imageHash: 'deadbeefhash',
      filename: 'mine.png',
    };
    const { result } = renderHook(() =>
      useQrPipeline({ ...baseInput, templateId: 'custom', customSource }),
    );
    await waitFor(() => expect(result.current.isRendering).toBe(false));

    const calls = vi.mocked(loadImageData).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // The mocked imageCache returns this fixed data URL for any hash.
    expect(calls[calls.length - 1][0]).toBe('data:image/png;base64,IAMTHESOURCE');
  });
});

describe('useQrPipeline — pipeline-vs-poster invariant', () => {
  // Defends CLAUDE.md "Key design constraints" #4: caption / posterSize /
  // palette must NOT be inputs to this hook. They live behind the poster
  // useMemo in App.tsx. This test fails compile-time-equivalently if a
  // maintainer adds a new field to QrPipelineInput without updating the
  // dep array, AND fails at runtime if a structurally-equal input
  // (same field values, fresh object identity) re-runs the pipeline.
  it('does not re-run buildMatrix when the input is structurally equal across renders', async () => {
    const stableInput: QrPipelineInput = {
      url: 'https://invariant.example.com',
      templateId: 'ntuas',
      customSource: null,
      silhouetteScale: 1,
      multiSize: false,
      filter: 'mono',
      renderMode: 'halftone',
    };

    const { result, rerender } = renderHook(
      (input: QrPipelineInput) => useQrPipeline(input),
      { initialProps: stableInput },
    );

    await waitFor(() => expect(result.current.isRendering).toBe(false));
    const callsAfterFirst = vi.mocked(buildMatrix).mock.calls.length;

    // Re-render with a structurally-equal but fresh-identity object. All
    // primitive fields are deep-equal; customSource is null in both. The
    // dep array compares each field individually so this MUST be a no-op.
    rerender({ ...stableInput });
    await waitFor(() => expect(result.current.isRendering).toBe(false));
    expect(vi.mocked(buildMatrix).mock.calls.length).toBe(callsAfterFirst);

    // Sanity check: an actual field change DOES re-run the pipeline. This
    // makes the no-op assertion above meaningful (the test isn't passing
    // because the hook is broken).
    rerender({ ...stableInput, url: 'https://invariant-changed.example.com' });
    await waitFor(() => expect(result.current.isRendering).toBe(false));
    expect(vi.mocked(buildMatrix).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
