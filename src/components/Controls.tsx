import type { ChangeEvent } from 'react';
import type { AdvancedSettings } from '../appReducer';
import type { RenderMode } from '../types';
import { TemplatePicker } from './TemplatePicker';
import { AdvancedOptions } from './AdvancedOptions';
import { QrIcon } from './QrIcon';

export interface ControlsProps {
  url: string;
  onUrlChange: (v: string) => void;

  templateId: string;
  onTemplateSelect: (id: string) => void;
  customSourceLabel?: string;
  /** Data URL of the uploaded custom source, resolved from the in-memory
   *  image cache. When present, the Custom tab renders a real preview
   *  instead of a placeholder tile. */
  customSourceDataUrl?: string;
  /** True when a custom source is uploaded and the user has chosen "Square"
   *  centre-crop. Only meaningful when templateId === 'custom'. */
  customCropToSquare?: boolean;
  /** Called when the user toggles between Original and Square crop for the
   *  uploaded custom source. Only invoked when a custom source is present. */
  onCustomCropToSquareChange?: (value: boolean) => void;

  caption: string;
  onCaptionChange: (v: string) => void;

  multiSize: boolean;
  silhouetteScale: number;
  renderMode: RenderMode;
  onAdvancedChange: (patch: Partial<AdvancedSettings>) => void;

  onCustomUpload: (file: File) => void;
  onDecodeQrUpload: (file: File) => void;
}

export function Controls(props: ControlsProps) {
  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onCustomUpload(file);
    e.target.value = '';
  };

  const handleDecodeUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onDecodeQrUpload(file);
    e.target.value = '';
  };

  const fileInputId = 'custom-source-upload';
  const decodeInputId = 'decode-qr-upload';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="mb-1 block text-sm font-medium text-plumblack">Link or text</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={props.url}
            onChange={(e) => props.onUrlChange(e.target.value)}
            placeholder="https://www.instagram.com/ntu_astro/"
            className="input-base flex-1 font-mono"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => document.getElementById(decodeInputId)?.click()}
            className="btn-secondary inline-flex shrink-0 items-center gap-2"
            title="Upload an existing QR image and auto-fill the link"
          >
            <QrIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Decode QR</span>
          </button>
          <input
            id={decodeInputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleDecodeUpload}
            className="hidden"
          />
        </div>
        <p className="mt-1 text-xs text-olivegray">
          Have an existing QR? Click{' '}
          <QrIcon
            className="inline-block h-3.5 w-3.5 align-[-2px] text-plumblack"
            aria-label="Decode QR"
            role="img"
          />
          {' '}to extract the link.
        </p>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-plumblack">Template</span>
        <TemplatePicker
          selectedId={props.templateId}
          customSourceLabel={props.customSourceLabel}
          customSourceDataUrl={props.customSourceDataUrl}
          onSelect={props.onTemplateSelect}
          onUploadClick={() => document.getElementById(fileInputId)?.click()}
          customCropToSquare={props.customCropToSquare}
          onCustomCropToSquareChange={props.onCustomCropToSquareChange}
        />
        <input
          id={fileInputId}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-plumblack">Caption (poster only)</span>
        <input
          type="text"
          value={props.caption}
          onChange={(e) => props.onCaptionChange(e.target.value)}
          placeholder="NTU Astro · 2026"
          className="input-base w-full"
          maxLength={120}
        />
      </label>

      <details className="rounded-card border border-sandgray bg-fog p-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-plumblack">
          Advanced options
        </summary>
        <div className="mt-4">
          <AdvancedOptions
            multiSize={props.multiSize}
            silhouetteScale={props.silhouetteScale}
            renderMode={props.renderMode}
            onChange={props.onAdvancedChange}
          />
        </div>
      </details>
    </div>
  );
}
