import { useEffect, useRef, useState } from 'react';
import type { ScanResult, FilterMode, RenderMode } from '../types';
import { DEFAULT_PLACEHOLDER_URL } from '../types';
import { findTemplate } from '../templates/presets';
import type { CustomSource } from '../appReducer';
import { buildMatrix } from '../lib/qrMatrix';
import { computeHalftoneTarget } from '../lib/halftoneTarget';
import { pickBestMask } from '../lib/maskOptimizer';
import { flipModulesByCodeword } from '../lib/moduleFlipper';
import { getRenderer } from '../lib/renderers';
import { buildPredictedCanvas } from '../lib/predictedCanvas';
import { buildSamplingContext } from '../lib/samplingSim';
import { verify } from '../lib/scanVerifier';
import { loadImageData } from '../lib/imageOps';
import { getCachedImageDataUrl } from '../lib/imageCache';
import { CELL_PX } from '../lib/pipelineConstants';
import { classifyPipelineError } from '../lib/errors';

// No quiet zone — canvas equals matrix.size × cellPx, silhouette fills the
// whole output. Phone scanners may struggle with halftone QRs that lack a
// quiet zone; the printed copy should be tested on a real phone.
const CANVAS_MARGIN_PX = 0;

export interface QrPipelineInput {
  url: string;
  templateId: string;
  customSource: CustomSource | null;
  silhouetteScale: number;
  multiSize: boolean;
  filter: FilterMode;
  renderMode: RenderMode;
}

export interface QrPipelineState {
  qrCanvas: HTMLCanvasElement | null;
  scanResults: ScanResult[];
  isRendering: boolean;
  pipelineError: string | undefined;
}

/** Builds the QR matrix and renders the halftone canvas whenever the inputs
 *  that affect the QR change. Caption / posterSize / palette intentionally do
 *  NOT live here — they only affect the poster compositor (a useMemo in App).
 *
 *  This hook owns four pieces of state that only make sense together:
 *    - qrCanvas       — the rendered HTMLCanvasElement (or last good fallback)
 *    - scanResults    — jsqr decode results at the canvas's natural size (and
 *                       optionally a 200×200 print-size check when multiSize)
 *    - isRendering    — true while an async pipeline run is in flight
 *    - pipelineError  — the most recent pipeline failure message, if any
 *
 *  Errors are surfaced via `pipelineError`. The caller may have its own error
 *  source (e.g. upload validation) and is responsible for merging them at the
 *  display layer. */
export function useQrPipeline(input: QrPipelineInput): QrPipelineState {
  // INVARIANT: Adding a field here re-runs the full pipeline (mask
  // optimisation, flipping, rendering — expensive). If the new field should
  // NOT re-run, route it through the poster `useMemo` in App.tsx instead.
  // See CLAUDE.md "Key design constraints" #4.
  const { url, templateId, customSource, silhouetteScale, multiSize, filter, renderMode } = input;

  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | undefined>(undefined);
  const lastGoodQrRef = useRef<HTMLCanvasElement | null>(null);
  // Monotonic run id. Each effect invocation grabs a unique id and any later
  // setState / ref-write checks `myId === runIdRef.current` so an in-flight
  // older run cannot overwrite a newer run's results — this complements the
  // `cancelled` flag which only handles the unmount case, not overlap.
  const runIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const myId = ++runIdRef.current;
    const isStale = (): boolean => cancelled || myId !== runIdRef.current;

    async function buildQr() {
      // setState lives inside the async fn (after the synchronous effect body
      // returns) so this isn't a synchronous setState-in-effect.
      setIsRendering(true);
      try {
        const resolvedUrl = url.trim() || DEFAULT_PLACEHOLDER_URL;
        const baseMatrix = buildMatrix(resolvedUrl);

        let sourcePath: string;
        if (templateId === 'custom' && customSource) {
          const cached = getCachedImageDataUrl(customSource.imageHash);
          if (!cached) {
            throw new Error('Custom image cache miss — please re-upload your image.');
          }
          sourcePath = cached;
        } else {
          sourcePath = findTemplate(templateId).sourcePath;
        }
        const imageData = await loadImageData(sourcePath);

        // Stage 2 prep: dithered halftone target (per-module dark/light vote
        // + importance weights). Used by both mask selection and flip scoring.
        const halftoneTarget = computeHalftoneTarget(
          imageData,
          baseMatrix.size,
          baseMatrix.reserved,
          silhouetteScale,
        );

        // Stage 2 prep: build the predicted subpixel canvas once. Mask
        // selection and flip scoring both need it. Flips below mutate only
        // data-module bits (not reserved-cell topology), so this canvas is
        // valid throughout — the renderer's reservedChecksum assertion guards
        // the invariant in dev builds.
        const marginCells = Math.max(0, Math.round(CANVAS_MARGIN_PX / CELL_PX));
        const predicted = buildPredictedCanvas(
          imageData,
          baseMatrix,
          marginCells,
          silhouetteScale,
          renderMode,
          filter,
        );

        // Stage 2: pick the QR mask whose post-mask bit pattern best matches
        // the dithered silhouette under the Sampling-Sim metric (Phase 2).
        const { best } = pickBestMask(resolvedUrl, halftoneTarget, predicted);

        // Stage 3a: per-RS-block greedy codeword flips, paid for by ECC slack.
        // The sampling context is built for the post-mask matrix and shared
        // with the flipper so its incremental readback updates are reused.
        const samplingContext = buildSamplingContext(predicted, best.matrix);
        const { matrix } = flipModulesByCodeword(best.matrix, halftoneTarget, {
          samplingContext,
        });

        // Stage 4: dispatch on render mode via the renderer registry.
        // Adding a new render mode = drop a Renderer file + register it in
        // src/lib/renderers/index.ts; no changes required here.
        const qr = getRenderer(renderMode).render({
          matrix,
          predicted,
          source: imageData,
          opts: {
            marginPx: CANVAS_MARGIN_PX,
            silhouetteScale,
            filter,
          },
        });

        const sizes = multiSize ? [qr.width, 200] : [qr.width];
        const results = verify(qr, sizes);

        if (isStale()) return;
        setQrCanvas(qr);
        setScanResults(results);
        setPipelineError(undefined);
        lastGoodQrRef.current = qr;
      } catch (err) {
        if (isStale()) return;
        setQrCanvas(lastGoodQrRef.current);
        setScanResults([]);
        const { userMessage } = classifyPipelineError(err);
        setPipelineError(userMessage);
      } finally {
        if (!isStale()) setIsRendering(false);
      }
    }

    buildQr();
    return () => {
      cancelled = true;
    };
  }, [url, templateId, customSource, silhouetteScale, multiSize, filter, renderMode]);

  return { qrCanvas, scanResults, isRendering, pipelineError };
}
