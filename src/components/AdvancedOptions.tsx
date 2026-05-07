import type { AdvancedSettings } from '../appReducer';

interface Props {
  multiSize: boolean;
  silhouetteScale: number;
  onChange: (patch: Partial<AdvancedSettings>) => void;
}

export function AdvancedOptions({ multiSize, silhouetteScale, onChange }: Props) {
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
    </div>
  );
}
