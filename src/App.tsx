import { useEffect, useReducer, useRef, useState } from 'react';
import type { ScanResult } from './types';
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
import { reducer, initialState, effectiveUrl } from './appReducer';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
// No quiet zone — canvas equals matrix.size × cellPx, silhouette fills the whole
// output. Phone scanners may struggle with halftone QRs that lack a quiet zone;
// use the printed copy on a real phone to confirm scanability before shipping.
const CANVAS_MARGIN_PX = 0;

async function loadImageData(src: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  const targetSide = 1024;
  canvas.width = targetSide;
  canvas.height = targetSide;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetSide, targetSide);
  const ratio = Math.min(targetSide / img.width, targetSide / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  ctx.drawImage(img, (targetSide - w) / 2, (targetSide - h) / 2, w, h);
  return ctx.getImageData(0, 0, targetSide, targetSide);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [qrCanvas, setQrCanvas] = useState<HTMLCanvasElement | null>(null);
  const [posterCanvas, setPosterCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const lastGoodCanvasesRef = useRef<{ qr: HTMLCanvasElement | null; poster: HTMLCanvasElement | null }>({
    qr: null,
    poster: null,
  });

  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);

    async function pipeline() {
      try {
        const url = effectiveUrl(state);
        const baseMatrix = buildMatrix(url);

        const sourcePath =
          state.templateId === 'custom' && state.customSource
            ? state.customSource.dataUrl
            : findTemplate(state.templateId).sourcePath;
        const imageData = await loadImageData(sourcePath);

        // Stage 2: pick the QR mask whose post-mask bit pattern best matches
        // the dithered silhouette, weighted by per-module importance.
        const halftoneTarget = computeHalftoneTarget(
          imageData,
          baseMatrix.size,
          state.background,
          baseMatrix.importance,
        );
        const { best } = pickBestMask(url, halftoneTarget);

        // Stage 3a: per-RS-block greedy codeword flips, paid for by ECC slack.
        const { matrix } = flipModulesByCodeword(best.matrix, halftoneTarget);

        const qr = renderHalftone(matrix, imageData, {
          marginPx: CANVAS_MARGIN_PX,
          background: state.background,
        });

        const palette =
          state.templateId === 'custom'
            ? { accent: '#435ee5', fallbackDark: '#211922' }
            : findTemplate(state.templateId).palette;
        const poster = composePoster(qr, state.caption, state.posterSize, palette);

        const sizes = state.multiSize ? [qr.width, 200] : [qr.width];
        const results = verify(qr, sizes);

        if (cancelled) return;
        setQrCanvas(qr);
        setPosterCanvas(poster);
        setScanResults(results);
        setErrorMessage(undefined);
        lastGoodCanvasesRef.current = { qr, poster };
      } catch (err) {
        if (cancelled) return;
        const last = lastGoodCanvasesRef.current;
        setQrCanvas(last.qr);
        setPosterCanvas(last.poster);
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

    pipeline();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const handleCustomUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('File is larger than 2MB. Pick a smaller PNG or SVG.');
      return;
    }
    if (!/^image\/(png|svg\+xml)$/i.test(file.type)) {
      setErrorMessage('Only PNG and SVG uploads are supported.');
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
          background={state.background}
          onAdvancedChange={(patch) => dispatch({ type: 'PATCH_ADVANCED', patch })}
          onCustomUpload={handleCustomUpload}
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
