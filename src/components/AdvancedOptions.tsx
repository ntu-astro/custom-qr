interface Props {
  marginPx: number;
  multiSize: boolean;
  background: string;
  onChange: (
    patch: Partial<{
      marginPx: number;
      multiSize: boolean;
      background: string;
    }>,
  ) => void;
}

export function AdvancedOptions({ marginPx, multiSize, background, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
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
