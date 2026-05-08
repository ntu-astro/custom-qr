/**
 * In-memory content-addressed cache for image data URLs.
 *
 * Motivation: custom upload data URLs can be multi-MB. Keeping them in
 * reducer state forces every dispatch to carry a copy, blocks persistence
 * (we can't localStorage a megabyte string), and makes future batch
 * generation impractical. This module owns the data URLs; reducer state
 * holds only the (small, stable) SHA-256 hash.
 *
 * The cache is process-lifetime; no eviction policy. Working set is
 * bounded by user's session uploads, which is fine for this app's scope.
 */

const cache = new Map<string, string>();

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash a data URL and cache it. Returns the content hash. */
export async function cacheImageDataUrl(dataUrl: string): Promise<string> {
  const hash = await sha256Hex(dataUrl);
  cache.set(hash, dataUrl);
  return hash;
}

/** Look up a previously cached data URL. Returns null if unknown. */
export function getCachedImageDataUrl(hash: string): string | null {
  return cache.get(hash) ?? null;
}

/** Test/dev utility — clear the cache. */
export function clearImageCache(): void {
  cache.clear();
}
