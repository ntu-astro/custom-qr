import { describe, it, expect, beforeEach } from 'vitest';
import {
  cacheImageDataUrl,
  getCachedImageDataUrl,
  clearImageCache,
} from './imageCache';

describe('imageCache', () => {
  beforeEach(() => {
    clearImageCache();
  });

  it('returns null for an unknown hash', () => {
    expect(getCachedImageDataUrl('deadbeef')).toBeNull();
  });

  it('round-trips a data URL through cache + lookup', async () => {
    const dataUrl = 'data:image/png;base64,IAMTHESOURCE';
    const hash = await cacheImageDataUrl(dataUrl);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(getCachedImageDataUrl(hash)).toBe(dataUrl);
  });

  it('produces the same hash for the same input (idempotent)', async () => {
    const dataUrl = 'data:image/png;base64,SAMEINPUT';
    const hashA = await cacheImageDataUrl(dataUrl);
    const hashB = await cacheImageDataUrl(dataUrl);
    expect(hashA).toBe(hashB);
  });

  it('produces different hashes for different inputs', async () => {
    const hashA = await cacheImageDataUrl('data:image/png;base64,AAAA');
    const hashB = await cacheImageDataUrl('data:image/png;base64,BBBB');
    expect(hashA).not.toBe(hashB);
  });

  it('clearImageCache empties the cache', async () => {
    const hash = await cacheImageDataUrl('data:image/png;base64,WIPE');
    expect(getCachedImageDataUrl(hash)).not.toBeNull();
    clearImageCache();
    expect(getCachedImageDataUrl(hash)).toBeNull();
  });

  it('produces a 64-char hex SHA-256 digest', async () => {
    const hash = await cacheImageDataUrl('data:image/png;base64,FORMAT');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
