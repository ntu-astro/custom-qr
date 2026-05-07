import { useEffect, useRef } from 'react';
import type { PosterSize, ScanResult } from '../types';
import { ScanBadge } from './ScanBadge';

interface Props {
  qrCanvas: HTMLCanvasElement | null;
  posterCanvas: HTMLCanvasElement | null;
  scanResults: ScanResult[];
  multiSize: boolean;
  posterSize: PosterSize;
  onPosterSizeChange: (s: PosterSize) => void;
  isRendering: boolean;
  errorMessage?: string;
}

const POSTER_OPTIONS: Array<{ label: string; size: PosterSize }> = [
  { label: 'Instagram Post (1080×1080)', size: { kind: 'igPost', width: 1080, height: 1080 } },
  { label: 'Instagram Story (1080×1920)', size: { kind: 'igStory', width: 1080, height: 1920 } },
  { label: 'A4 Portrait (2480×3508)', size: { kind: 'a4', width: 2480, height: 3508 } },
];

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function svgWrap(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  const w = canvas.width;
  const h = canvas.height;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image href="${dataUrl}" width="${w}" height="${h}"/>
</svg>`;
}

/** Flatten a transparent QR canvas onto white before PNG export. The renderer
 *  emits transparent pixels for "light" modules, which previews fine on the
 *  app's light card but lets the dark ink dots disappear into dark backgrounds
 *  (e.g. macOS Preview's dark mode). The SVG export keeps transparency since
 *  designers typically want to composite it themselves. */
function flattenedPngDataUrl(canvas: HTMLCanvasElement): string {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}

export function QrPreview({
  qrCanvas,
  posterCanvas,
  scanResults,
  multiSize,
  posterSize,
  onPosterSizeChange,
  isRendering,
  errorMessage,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.replaceChildren();
    if (qrCanvas) {
      qrCanvas.style.maxWidth = '100%';
      qrCanvas.style.height = 'auto';
      qrCanvas.style.imageRendering = 'pixelated';
      qrCanvas.style.borderRadius = '20px';
      mount.appendChild(qrCanvas);
    }
  }, [qrCanvas]);

  const handlePng = () => {
    if (!qrCanvas) return;
    downloadDataUrl('astro-qr.png', flattenedPngDataUrl(qrCanvas));
  };

  const handleSvg = () => {
    if (!qrCanvas) return;
    const blob = new Blob([svgWrap(qrCanvas)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl('astro-qr.svg', url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePoster = () => {
    if (!posterCanvas) return;
    downloadDataUrl('astro-qr-poster.png', posterCanvas.toDataURL('image/png'));
  };

  return (
    <section className="panel flex flex-col gap-4 bg-white">
      <div
        ref={mountRef}
        className={
          'relative aspect-square w-full overflow-hidden rounded-card border border-sandgray bg-fog ' +
          (isRendering ? 'animate-pulse' : '')
        }
        aria-live="polite"
      />
      {errorMessage ? (
        <p className="rounded-button bg-warmlight px-4 py-2 text-sm text-errorred" role="alert">
          {errorMessage}
        </p>
      ) : (
        <ScanBadge results={scanResults} multiSize={multiSize} />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={handlePng} disabled={!qrCanvas}>
            QR only (PNG)
          </button>
          <button type="button" className="btn-secondary" onClick={handleSvg} disabled={!qrCanvas}>
            QR only (SVG)
          </button>
          <button type="button" className="btn-primary" onClick={handlePoster} disabled={!posterCanvas}>
            Poster (PNG)
          </button>
        </div>
        <PosterSizePicker value={posterSize} onChange={onPosterSizeChange} />
      </div>
    </section>
  );
}

function PosterSizePicker({
  value,
  onChange,
}: {
  value: PosterSize;
  onChange: (s: PosterSize) => void;
}) {
  const isCustom = value.kind === 'custom';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-olivegray">
      <label className="flex items-center gap-2">
        Poster size:
        <select
          value={value.kind}
          onChange={(e) => {
            const k = e.target.value as PosterSize['kind'];
            const preset = POSTER_OPTIONS.find((p) => p.size.kind === k);
            if (preset) onChange(preset.size);
            else onChange({ kind: 'custom', width: value.width, height: value.height });
          }}
          className="input-base"
        >
          {POSTER_OPTIONS.map((p) => (
            <option key={p.size.kind} value={p.size.kind}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {isCustom && (
        <>
          <input
            type="number"
            min={64}
            max={8000}
            value={value.width}
            onChange={(e) =>
              onChange({ kind: 'custom', width: clampSide(Number(e.target.value)), height: value.height })
            }
            className="input-base w-24"
          />
          <span>×</span>
          <input
            type="number"
            min={64}
            max={8000}
            value={value.height}
            onChange={(e) =>
              onChange({ kind: 'custom', width: value.width, height: clampSide(Number(e.target.value)) })
            }
            className="input-base w-24"
          />
        </>
      )}
    </div>
  );
}

function clampSide(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1080;
  return Math.min(8000, Math.max(64, Math.round(v)));
}
