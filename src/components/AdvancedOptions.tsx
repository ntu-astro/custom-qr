import type { HalftoneStyle } from '../types';

interface Props {
  style: HalftoneStyle;
  density: number;
  marginPx: number;
  multiSize: boolean;
  background: string;
  onChange: (
    patch: Partial<{
      style: HalftoneStyle;
      density: number;
      marginPx: number;
      multiSize: boolean;
      background: string;
    }>,
  ) => void;
}

const STYLE_OPTIONS: Array<{ value: HalftoneStyle; label: string }> = [
  { value: 'hybrid', label: 'Hybrid (default)' },
  { value: 'variable', label: 'Variable dot size' },
  { value: 'stippling', label: 'Stippling' },
  { value: 'qrgrid', label: 'QR-grid dithered' },
];

export function AdvancedOptions({ style, density, marginPx, multiSize, background, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Halftone style</span>
        <select
          value={style}
          onChange={(e) => onChange({ style: e.target.value as HalftoneStyle })}
          className="input-base w-full"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Halftone density: {density}%</span>
        <input
          type="range"
          min={30}
          max={80}
          value={density}
          onChange={(e) => onChange({ density: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">Margin (quiet zone): {marginPx}px</span>
        <input
          type="range"
          min={0}
          max={60}
          value={marginPx}
          onChange={(e) => onChange({ marginPx: Number(e.target.value) })}
          className="w-full"
        />
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={multiSize}
          onChange={(e) => onChange({ multiSize: e.target.checked })}
        />
        <span className="text-sm text-olivegray">Multi-size scan check (also test print size)</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-olivegray">
          Background color {background === 'transparent' ? '(transparent)' : ''}
        </span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={background === 'transparent' ? '#ffffff' : background}
            onChange={(e) => onChange({ background: e.target.value })}
            className="h-10 w-14 rounded-button border border-warmsilver"
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onChange({ background: 'transparent' })}
          >
            Make transparent
          </button>
        </div>
      </label>
    </div>
  );
}
