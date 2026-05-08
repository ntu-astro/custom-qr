import { useState } from 'react';
import { TEMPLATES, findTemplate } from '../templates/presets';
import type { TemplatePreset, TemplateCategory } from '../types';
import { CustomTabIllustration } from './CustomTabIllustration';

/** Tab union including the synthetic 'custom' tab (the upload UI lives here,
 *  not in the preset list). */
type Tab = TemplateCategory | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'astronomy', label: 'Astronomy' },
  { id: 'art', label: 'Art' },
  { id: 'custom', label: 'Custom' },
];

interface Props {
  selectedId: string;
  customSourceLabel?: string;
  /** Data URL of the uploaded custom source, used to render the preview in
   *  the Custom tab. Resolved by the parent from the in-memory image cache. */
  customSourceDataUrl?: string;
  onSelect: (id: string) => void;
  onUploadClick: () => void;
  /** Crop toggle state for the uploaded custom source. Only meaningful in the
   *  Custom tab when a source is loaded. */
  customCropToSquare?: boolean;
  onCustomCropToSquareChange?: (value: boolean) => void;
}

/** Map a templateId to the tab it belongs to. */
function tabForTemplate(id: string): Tab {
  if (id === 'custom') return 'custom';
  return findTemplate(id).category;
}

function Tile({
  preset,
  selected,
  onClick,
}: {
  preset: TemplatePreset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        'flex aspect-square flex-col items-center justify-between rounded-card border bg-white p-3 text-left transition ' +
        (selected
          ? 'border-pinred shadow-[0_0_0_1px_#e60023]'
          : 'border-sandgray hover:border-warmsilver')
      }
    >
      <img
        src={preset.sourcePath}
        alt=""
        className="aspect-square w-full object-contain"
        loading="lazy"
      />
      <span className="mt-1 text-xs text-olivegray">{preset.displayName}</span>
    </button>
  );
}

function CropToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-olivegray">Crop</span>
      <div
        role="radiogroup"
        aria-label="Custom image crop"
        className="inline-flex self-start rounded-card border border-sandgray bg-fog p-0.5 text-xs"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange(false)}
          className={
            'rounded-card px-3 py-1 transition-colors ' +
            (!value
              ? 'bg-white font-semibold text-plumblack shadow-sm'
              : 'text-olivegray hover:text-plumblack')
          }
        >
          Original
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === true}
          onClick={() => onChange(true)}
          className={
            'rounded-card px-3 py-1 transition-colors ' +
            (value
              ? 'bg-white font-semibold text-plumblack shadow-sm'
              : 'text-olivegray hover:text-plumblack')
          }
        >
          Square
        </button>
      </div>
    </div>
  );
}

export function TemplatePicker({
  selectedId,
  customSourceLabel,
  customSourceDataUrl,
  onSelect,
  onUploadClick,
  customCropToSquare,
  onCustomCropToSquareChange,
}: Props) {
  // Active tab is local UI state, synced from selectedId so external changes
  // (upload → templateId='custom', or restoring a persisted template) bring
  // the user to the right tab. Tab clicks update only this state, not
  // selectedId — picking a template tile is what changes selectedId. The
  // sync uses the React-docs-recommended "adjust state during render"
  // pattern with a snapshot useState (the project lints out both
  // setState-in-effect and ref access in render, leaving this as the
  // canonical option).
  const [activeTab, setActiveTab] = useState<Tab>(() => tabForTemplate(selectedId));
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId);
    setActiveTab(tabForTemplate(selectedId));
  }

  const astronomyPresets = TEMPLATES.filter((t) => t.category === 'astronomy');
  const artPresets = TEMPLATES.filter((t) => t.category === 'art');

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Template category" className="flex gap-1 border-b border-sandgray">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={
                'relative -mb-px px-3 py-2 text-sm transition-colors ' +
                (isActive
                  ? 'border-b-2 border-plumblack font-semibold text-plumblack'
                  : 'border-b-2 border-transparent text-olivegray hover:text-plumblack')
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'astronomy' && (
        <div role="tabpanel" aria-label="Astronomy templates" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {astronomyPresets.map((p) => (
            <Tile
              key={p.id}
              preset={p}
              selected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </div>
      )}

      {activeTab === 'art' && (
        <div role="tabpanel" aria-label="Art templates" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {artPresets.map((p) => (
            <Tile
              key={p.id}
              preset={p}
              selected={selectedId === p.id}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </div>
      )}

      {activeTab === 'custom' && (
        <div role="tabpanel" aria-label="Custom upload" className="flex flex-col gap-3">
          {customSourceLabel ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-label={`Replace image (current: ${customSourceLabel})`}
                onClick={onUploadClick}
                className="group relative aspect-square w-full max-w-[220px] self-start overflow-hidden rounded-card border border-sandgray bg-white transition hover:border-warmsilver"
              >
                {customSourceDataUrl && (
                  <img
                    src={customSourceDataUrl}
                    alt=""
                    className={
                      'h-full w-full ' +
                      (customCropToSquare ? 'object-cover' : 'object-contain')
                    }
                  />
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-plumblack/0 text-xs font-medium text-white opacity-0 transition group-hover:bg-plumblack/40 group-hover:opacity-100">
                  Click to replace
                </span>
              </button>
              <p className="max-w-[220px] truncate text-xs text-olivegray" title={customSourceLabel}>
                {customSourceLabel}
              </p>
              {onCustomCropToSquareChange && (
                <CropToggle
                  value={customCropToSquare === true}
                  onChange={onCustomCropToSquareChange}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-card border border-sandgray bg-fog px-6 py-8 text-center">
              <div className="w-44 sm:w-52">
                <CustomTabIllustration />
              </div>
              <h3 className="text-lg font-semibold tracking-heading text-plumblack">
                Bring your own image
              </h3>
              <p className="max-w-xs text-sm text-olivegray">
                Drop a photo and we'll turn it into a working QR.
              </p>
              <button type="button" onClick={onUploadClick} className="btn-primary text-white">
                Choose image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
