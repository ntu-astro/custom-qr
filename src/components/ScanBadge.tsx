import type { ScanResult } from '../types';

interface Props {
  results: ScanResult[];
  multiSize: boolean;
}

const SCREEN_SIZE_THRESHOLD = 320;

function pickResult(results: ScanResult[], predicate: (s: number) => boolean): ScanResult | undefined {
  return results.find((r) => predicate(r.size));
}

export function ScanBadge({ results, multiSize }: Props) {
  const screen = pickResult(results, (s) => s >= SCREEN_SIZE_THRESHOLD);
  const print = pickResult(results, (s) => s < SCREEN_SIZE_THRESHOLD);

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <ScreenBadge ok={!!screen?.ok} multi={multiSize} />
      {multiSize && <PrintBadge ok={!!print?.ok} />}
    </div>
  );
}

function ScreenBadge({ ok, multi }: { ok: boolean; multi: boolean }) {
  if (ok) {
    return (
      <span className="rounded-button bg-fog px-3 py-1 text-plumblack">
        ✓ Scannable{multi ? ' on screen' : ''}
      </span>
    );
  }
  return (
    <span className="rounded-button bg-warmlight px-3 py-1 text-errorred">
      ⚠ May not scan reliably — try a bolder silhouette or higher contrast
    </span>
  );
}

function PrintBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="rounded-button bg-fog px-3 py-1 text-plumblack">
        ✓ Scannable when printed small (200×200px)
      </span>
    );
  }
  return (
    <span className="rounded-button bg-warmlight px-3 py-1 text-errorred">
      ✗ Won&apos;t scan at print size
    </span>
  );
}
