import { useEffect, useRef, useState } from 'react';
import type { ScanResult, FilterMode } from '../types';
import { DEFAULT_PLACEHOLDER_URL } from '../types';
import { findTemplate } from '../templates/presets';
import type { CustomSource } from '../appReducer';
import { buildMatrix } from '../lib/qrMatrix';
import { computeHalftoneTarget } from '../lib/halftoneTarget';
import { pickBestMask } from '../lib/maskOptimizer';
import { flipModulesByCodeword } from '../lib/moduleFlipper';
import { render as renderHalftone } from '../lib/halftoneRenderer';
import { verify } from '../lib/scanVerifier';
import { loadImageData } from '../lib/imageOps';

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
  const { url, templateId, customSource, silhouetteScale, multiSize, filter } = input;

  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | undefined>(undefined);
  const lastGoodQrRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      // setState lives inside the async fn (after the synchronous effect body
      // returns) so this isn't a synchronous setState-in-effect.
      setIsRendering(true);
      try {
        const resolvedUrl = url.trim() || DEFAULT_PLACEHOLDER_URL;
        const baseMatrix = buildMatrix(resolvedUrl);

        const sourcePath =
          templateId === 'custom' && customSource
            ? customSource.dataUrl
            : findTemplate(templateId).sourcePath;
        const imageData = await loadImageData(sourcePath);

        // Stage 2: pick the QR mask whose post-mask bit pattern best matches
        // the dithered silhouette, weighted by per-module importance.
        const halftoneTarget = computeHalftoneTarget(
          imageData,
          baseMatrix.size,
          baseMatrix.reserved,
          silhouetteScale,
        );
        const { best } = pickBestMask(resolvedUrl, halftoneTarget);

        // Stage 3a: per-RS-block greedy codeword flips, paid for by ECC slack.
        const { matrix } = flipModulesByCodeword(best.matrix, halftoneTarget);

        const qr = renderHalftone(matrix, imageData, {
          marginPx: CANVAS_MARGIN_PX,
          silhouetteScale,
          filter,
        });

        const sizes = multiSize ? [qr.width, 200] : [qr.width];
        const results = verify(qr, sizes);

        if (cancelled) return;
        setQrCanvas(qr);
        setScanResults(results);
        setPipelineError(undefined);
        lastGoodQrRef.current = qr;
      } catch (err) {
        if (cancelled) return;
        setQrCanvas(lastGoodQrRef.current);
        setScanResults([]);
        const msg = err instanceof Error ? err.message : 'Render failed';
        if (/too long/i.test(msg) || /not enough|no version|cannot encode/i.test(msg)) {
          setPipelineError('Input too long for ECC level H — shorten the URL or text.');
        } else {
          setPipelineError(msg);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    buildQr();
    return () => {
      cancelled = true;
    };
  }, [url, templateId, customSource, silhouetteScale, multiSize, filter]);

  return { qrCanvas, scanResults, isRendering, pipelineError };
}
