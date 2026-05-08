import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Palette, FilterMode } from './types';
import { findTemplate } from './templates/presets';
import { Controls } from './components/Controls';
import { QrPreview } from './components/QrPreview';
import { composePoster } from './lib/composer';
import { decodeQrImage } from './lib/decodeQrImage';
import { reducer, getInitialState, PERSIST_KEY } from './appReducer';
import { readFileAsDataUrl } from './lib/imageOps';
import { useQrPipeline } from './hooks/useQrPipeline';

const CUSTOM_PALETTE: Palette = { accent: '#435ee5' };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);

  const palette: Palette = useMemo(
    () =>
      state.templateId === 'custom'
        ? CUSTOM_PALETTE
        : findTemplate(state.templateId).palette,
    [state.templateId],
  );

  // Pull out the slice of state used downstream. The QR pipeline only depends
  // on a sub-slice (see useQrPipeline) — caption / posterSize must NOT live in
  // its dep array, otherwise typing in the caption would re-run mask
  // optimisation. The poster compositor below uses the rest.
  const { url, templateId, customSource, silhouetteScale, multiSize, caption, posterSize } = state;

  // Custom uploads are assumed to be colour photos; built-in templates are
  // pure-black silhouettes where the colour filter has no effect.
  const filter: FilterMode = templateId === 'custom' ? 'color' : 'mono';

  const { qrCanvas, scanResults, isRendering, pipelineError } = useQrPipeline({
    url,
    templateId,
    customSource,
    silhouetteScale,
    multiSize,
    filter,
  });

  // Persist a tiny slice of state across reloads. Intentionally excludes
  // customSource (potentially huge data URL), posterSize, multiSize, and
  // silhouetteScale. Failures (private mode, quota) are swallowed.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ url, templateId, caption }));
    } catch {
      // Ignore quota / disabled storage errors.
    }
  }, [url, templateId, caption]);

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

  // Upload errors and pipeline errors are tracked separately so an upload
  // validation message doesn't get clobbered by an unrelated pipeline rerun
  // (and vice versa). Upload errors take precedence — they're the more recent
  // user action when both are present, and upload success paths clear them.
  const errorMessage = uploadError ?? pipelineError;

  const handleDecodeQrUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File is larger than 10MB. Pick a smaller image.');
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setUploadError('Only PNG, JPG, or WebP images can be decoded.');
      return;
    }
    try {
      const decoded = await decodeQrImage(file);
      dispatch({ type: 'SET_URL', value: decoded });
      setUploadError(undefined);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not decode QR');
    }
  };

  const handleCustomUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File is larger than 10MB. Pick a smaller PNG or SVG.');
      return;
    }
    if (!/^image\/(png|svg\+xml|jpe?g|webp)$/i.test(file.type)) {
      setUploadError('Only PNG, JPG, WebP, or SVG uploads are supported.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      dispatch({ type: 'SET_CUSTOM_SOURCE', source: { dataUrl, filename: file.name } });
      setUploadError(undefined);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
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
