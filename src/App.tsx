import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Palette, ScanResult } from './types';
import { DEFAULT_PLACEHOLDER_URL } from './types';
import { findTemplate } from './templates/presets';
import { Controls } from './components/Controls';
import { QrPreview } from './components/QrPreview';
import { buildMatrix } from './lib/qrMatrix';
import { computeHalftoneTarget } from './lib/halftoneTarget';
import { pickBestMask } from './lib/maskOptimizer';
import { flipModulesByCodeword } from './lib/moduleFlipper';
import { render as renderHalftone } from './lib/halftoneRenderer';
import { composePoster } from './lib/composer';
import { verify } from './lib/scanVerifier';
import { decodeQrImage } from './lib/decodeQrImage';
import { reducer, initialState } from './appReducer';
import { loadImageData, readFileAsDataUrl } from './lib/imageOps';

const CUSTOM_PALETTE: Palette = { accent: '#435ee5' };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// No quiet zone — canvas equals matrix.size × cellPx, silhouette fills the whole
// output. Phone scanners may struggle with halftone QRs that lack a quiet zone;
// use the printed copy on a real phone to confirm scanability before shipping.
const CANVAS_MARGIN_PX = 0;

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const lastGoodQrRef = useRef<HTMLCanvasElement | null>(null);

  const palette: Palette = useMemo(
    () =>
      state.templateId === 'custom'
        ? CUSTOM_PALETTE
        : findTemplate(state.templateId).palette,
    [state.templateId],
  );

  // Pull out the exact slice of state Effect A depends on so eslint-react-hooks
  // can verify exhaustive deps without us listing the whole `state` object
  // (which would re-run the QR pipeline on caption/posterSize edits — see
  // Effect B for those).
  const { url, templateId, customSource, silhouetteScale, multiSize, caption, posterSize } = state;

  // Effect A: build the QR matrix and render the halftone canvas. Re-runs only
  // when inputs that actually affect the QR change (URL, template/silhouette,
  // and multiSize for verify). Caption/posterSize do NOT trigger this.
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
          baseMatrix.importance,
          silhouetteScale,
        );
        const { best } = pickBestMask(resolvedUrl, halftoneTarget);

        // Stage 3a: per-RS-block greedy codeword flips, paid for by ECC slack.
        const { matrix } = flipModulesByCodeword(best.matrix, halftoneTarget);

        const qr = renderHalftone(matrix, imageData, {
          marginPx: CANVAS_MARGIN_PX,
          silhouetteScale,
          // Custom uploads are assumed to be colour photos; built-in templates
          // are pure-black silhouettes where colour halftone has no effect.
          colorHalftone: templateId === 'custom',
        });

        const sizes = multiSize ? [qr.width, 200] : [qr.width];
        const results = verify(qr, sizes);

        if (cancelled) return;
        setQrCanvas(qr);
        setScanResults(results);
        setErrorMessage(undefined);
        lastGoodQrRef.current = qr;
      } catch (err) {
        if (cancelled) return;
        setQrCanvas(lastGoodQrRef.current);
        setScanResults([]);
        const msg = err instanceof Error ? err.message : 'Render failed';
        if (/too long/i.test(msg) || /not enough|no version|cannot encode/i.test(msg)) {
          setErrorMessage('Input too long for ECC level H — shorten the URL or text.');
        } else {
          setErrorMessage(msg);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    buildQr();
    return () => {
      cancelled = true;
    };
  }, [url, templateId, customSource, silhouetteScale, multiSize]);

  // Compose the poster from the rendered QR canvas. Pure derivation of state,
  // so useMemo (not an effect) — re-runs when caption/posterSize/palette/qrCanvas change.
  // composePoster is sync and effectively throw-free; on the rare failure we
  // simply yield null and disable the download button (handled in QrPreview).
  const posterCanvas = useMemo<HTMLCanvasElement | null>(() => {
    if (!qrCanvas) return null;
    try {
      return composePoster(qrCanvas, caption, posterSize, palette);
    } catch {
      return null;
    }
  }, [qrCanvas, caption, posterSize, palette]);

  const handleDecodeQrUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('File is larger than 10MB. Pick a smaller image.');
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setErrorMessage('Only PNG, JPG, or WebP images can be decoded.');
      return;
    }
    try {
      const decoded = await decodeQrImage(file);
      dispatch({ type: 'SET_URL', value: decoded });
      setErrorMessage(undefined);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not decode QR');
    }
  };

  const handleCustomUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('File is larger than 10MB. Pick a smaller PNG or SVG.');
      return;
    }
    if (!/^image\/(png|svg\+xml|jpe?g|webp)$/i.test(file.type)) {
      setErrorMessage('Only PNG, JPG, WebP, or SVG uploads are supported.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      dispatch({ type: 'SET_CUSTOM_SOURCE', source: { dataUrl, filename: file.name } });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-10">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-heading">Astro QR</h1>
        <p className="text-sm text-olivegray">
          Halftone-style QR codes for NTU Astronomical Society. No backend, no tracking.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <Controls
          url={state.url}
          onUrlChange={(v) => dispatch({ type: 'SET_URL', value: v })}
          templateId={state.templateId}
          onTemplateSelect={(id) => dispatch({ type: 'SELECT_TEMPLATE', id })}
          customSourceLabel={state.customSource?.filename}
          caption={state.caption}
          onCaptionChange={(v) => dispatch({ type: 'SET_CAPTION', value: v })}
          multiSize={state.multiSize}
          silhouetteScale={state.silhouetteScale}
          onAdvancedChange={(patch) => dispatch({ type: 'PATCH_ADVANCED', patch })}
          onCustomUpload={handleCustomUpload}
          onDecodeQrUpload={handleDecodeQrUpload}
        />
        <QrPreview
          qrCanvas={qrCanvas}
          posterCanvas={posterCanvas}
          scanResults={scanResults}
          multiSize={state.multiSize}
          posterSize={state.posterSize}
          onPosterSizeChange={(s) => dispatch({ type: 'SET_POSTER_SIZE', size: s })}
          isRendering={isRendering}
          errorMessage={errorMessage}
        />
      </div>
    </main>
  );
}
