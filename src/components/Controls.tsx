import type { ChangeEvent } from 'react';
import { TemplatePicker } from './TemplatePicker';
import { AdvancedOptions } from './AdvancedOptions';

export interface ControlsProps {
  url: string;
  onUrlChange: (v: string) => void;

  templateId: string;
  onTemplateSelect: (id: string) => void;
  customSourceLabel?: string;

  caption: string;
  onCaptionChange: (v: string) => void;

  multiSize: boolean;
  background: string;
  silhouetteScale: number;
  onAdvancedChange: (
    patch: Partial<{
      multiSize: boolean;
      background: string;
      silhouetteScale: number;
    }>,
  ) => void;

  onCustomUpload: (file: File) => void;
}

export function Controls(props: ControlsProps) {
  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) props.onCustomUpload(file);
    e.target.value = '';
  };

  const fileInputId = 'custom-source-upload';

  return (
    <div className="flex flex-col gap-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-plumblack">Link or text</span>
        <input
          type="text"
          value={props.url}
          onChange={(e) => props.onUrlChange(e.target.value)}
          placeholder="https://ntuastro.com"
          className="input-base w-full font-mono"
          spellCheck={false}
        />
      </label>

      <div>
        <span className="mb-2 block text-sm font-medium text-plumblack">Template</span>
        <TemplatePicker
          selectedId={props.templateId}
          customSourceLabel={props.customSourceLabel}
          onSelect={props.onTemplateSelect}
          onUploadClick={() => document.getElementById(fileInputId)?.click()}
        />
        <input
          id={fileInputId}
          type="file"
          accept="image/png,image/svg+xml"
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
            background={props.background}
            silhouetteScale={props.silhouetteScale}
            onChange={props.onAdvancedChange}
          />
        </div>
      </details>
    </div>
  );
}
