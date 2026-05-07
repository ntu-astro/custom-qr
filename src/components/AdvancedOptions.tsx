interface Props {
  multiSize: boolean;
  background: string;
  silhouetteScale: number;
  onChange: (
    patch: Partial<{
      multiSize: boolean;
      background: string;
      silhouetteScale: number;
    }>,
  ) => void;
}

export function AdvancedOptions({ multiSize, background, silhouetteScale, onChange }: Props) {
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
