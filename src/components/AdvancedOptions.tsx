import type { AdvancedSettings } from '../appReducer';
import type { FilterMode, RenderMode } from '../types';

interface Props {
  multiSize: boolean;
  silhouetteScale: number;
  renderMode: RenderMode;
  filter: FilterMode;
  onChange: (patch: Partial<AdvancedSettings>) => void;
}

export function AdvancedOptions({ multiSize, silhouetteScale, renderMode, filter, onChange }: Props) {
  const scalePct = Math.round(silhouetteScale * 100);
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-sm text-olivegray">
          <span>Silhouette size</span>
          <span className="font-mono text-xs">{scalePct}%</span>
        </span>
        <input
          type="range"
          min={30}
          max={100}
          step={5}
          value={scalePct}
          onChange={(e) => onChange({ silhouetteScale: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-olivegray">Render style</legend>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="renderMode"
            value="composite"
            checked={renderMode === 'composite'}
            onChange={() => onChange({ renderMode: 'composite' })}
          />
          <span className={renderMode === 'composite' ? 'font-semibold text-plumblack' : 'text-olivegray'}>
            Composite
          </span>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="renderMode"
            value="halftone"
            checked={renderMode === 'halftone'}
            onChange={() => onChange({ renderMode: 'halftone' })}
          />
          <span className={renderMode === 'halftone' ? 'font-semibold text-plumblack' : 'text-olivegray'}>
            Halftone
          </span>
        </label>
        <p className="text-xs text-olivegray">
          Composite paints a clean QR centre with the image as surround; Halftone diffuses the image across all modules.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-olivegray">Color mode</legend>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="filter"
            value="color"
            checked={filter === 'color'}
            onChange={() => onChange({ filter: 'color' })}
          />
          <span className={filter === 'color' ? 'font-semibold text-plumblack' : 'text-olivegray'}>
            Color
          </span>
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            name="filter"
            value="mono"
            checked={filter === 'mono'}
            onChange={() => onChange({ filter: 'mono' })}
          />
          <span className={filter === 'mono' ? 'font-semibold text-plumblack' : 'text-olivegray'}>
            Mono
          </span>
        </label>
        <p className="text-xs text-olivegray">
          Color samples ink per-pixel from the source; Mono collapses the image to a single dominant tone (better for high-contrast silhouettes).
        </p>
      </fieldset>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={multiSize}
          onChange={(e) => onChange({ multiSize: e.target.checked })}
        />
        <span className="text-sm text-olivegray">Multi-size scan check (also test print size)</span>
      </label>
    </div>
  );
}
