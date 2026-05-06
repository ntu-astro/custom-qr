import { TEMPLATES } from '../templates/presets';
import type { TemplatePreset } from '../types';

interface Props {
  selectedId: string;
  customSourceLabel?: string;
  onSelect: (id: string) => void;
  onUploadClick: () => void;
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

export function TemplatePicker({ selectedId, customSourceLabel, onSelect, onUploadClick }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {TEMPLATES.map((p) => (
        <Tile
          key={p.id}
          preset={p}
          selected={selectedId === p.id}
          onClick={() => onSelect(p.id)}
        />
      ))}
      <button
        type="button"
        aria-pressed={selectedId === 'custom'}
        onClick={onUploadClick}
        className={
          'flex aspect-square flex-col items-center justify-center rounded-card border-dashed bg-fog p-3 text-center text-xs text-olivegray transition ' +
          (selectedId === 'custom'
            ? 'border-2 border-pinred text-plumblack'
            : 'border-2 border-warmsilver hover:border-plumblack')
        }
      >
        <span className="text-2xl leading-none">+</span>
        <span className="mt-2">{customSourceLabel ?? 'Upload'}</span>
      </button>
    </div>
  );
}
