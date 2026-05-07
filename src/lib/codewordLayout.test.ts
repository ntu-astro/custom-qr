import { describe, it, expect } from 'vitest';
import { buildMatrix } from './qrMatrix';
import {
  getEccLayoutForH,
  streamIndexToBlock,
  buildStreamIndexToBlockTable,
  buildModuleStreamMap,
} from './codewordLayout';

describe('getEccLayoutForH', () => {
  it('matches the QR spec for version 5 (used by https://www.instagram.com/ntu_astro/)', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    expect(m.size).toBe(37); // version 5 = 4*5 + 17 = 37
    const layout = getEccLayoutForH(m.size);
    expect(layout.version).toBe(5);
    expect(layout.totalCodewords).toBe(134);
    expect(layout.dataTotalCodewords).toBe(46); // 134 - 88
    expect(layout.ecTotalBlocks).toBe(4);
    expect(layout.ecCount).toBe(22); // 88 ECC / 4 blocks
    // 46 data codewords across 4 blocks: 2×11 (group 1) + 2×12 (group 2).
    expect(layout.dataCodewordsInGroup1).toBe(11);
    expect(layout.dataCodewordsInGroup2).toBe(12);
    expect(layout.blocksInGroup1).toBe(2);
    expect(layout.blocksInGroup2).toBe(2);
  });

  it('rejects an out-of-range matrix size', () => {
    expect(() => getEccLayoutForH(13)).toThrow();
    expect(() => getEccLayoutForH(178)).toThrow();
    expect(() => getEccLayoutForH(36)).toThrow(); // not 4*v+17 for any integer v
  });
});

describe('streamIndexToBlock + table', () => {
  it('agrees with the precomputed table at every index', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const layout = getEccLayoutForH(m.size);
    const table = buildStreamIndexToBlockTable(layout);
    expect(table).toHaveLength(layout.totalCodewords);
    for (let i = 0; i < layout.totalCodewords; i++) {
      const a = streamIndexToBlock(i, layout);
      const b = table[i];
      expect(a).toEqual(b);
    }
  });

  it('covers every (block, type, posInBlock) exactly once', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const layout = getEccLayoutForH(m.size);
    const table = buildStreamIndexToBlockTable(layout);
    const seen = new Set<string>();
    for (const p of table) {
      const key = `${p.block}/${p.isEcc ? 'e' : 'd'}/${p.posInBlock}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    // Sanity: the set size equals every block × (data length + ECC count).
    let expectedSize = 0;
    for (let r = 0; r < layout.ecTotalBlocks; r++) {
      const dataLen = r < layout.blocksInGroup1
        ? layout.dataCodewordsInGroup1
        : layout.dataCodewordsInGroup2;
      expectedSize += dataLen + layout.ecCount;
    }
    expect(seen.size).toBe(expectedSize);
    expect(seen.size).toBe(layout.totalCodewords);
  });
});

describe('buildModuleStreamMap', () => {
  it('assigns exactly totalCodewords × 8 module slots', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const layout = getEccLayoutForH(m.size);
    const map = buildModuleStreamMap(m);

    let assigned = 0;
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (map[y][x] !== null) assigned++;
      }
    }
    // Every non-reserved module owns exactly one bit; total bits = 8 × codewords.
    expect(assigned).toBe(layout.totalCodewords * 8);
  });

  it('is a bijection — every (streamIdx, bitInCodeword) appears exactly once', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const layout = getEccLayoutForH(m.size);
    const map = buildModuleStreamMap(m);

    const seen = new Set<string>();
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const p = map[y][x];
        if (p === null) continue;
        const key = `${p.streamIdx}.${p.bitInCodeword}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(layout.totalCodewords * 8);
  });

  it('returns null for reserved modules (importance 0)', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const map = buildModuleStreamMap(m);
    // Top-left finder, timing row 6, format-info col 8 — all reserved.
    expect(map[0][0]).toBeNull();
    expect(map[6][8]).toBeNull();
    expect(map[8][0]).toBeNull();
    expect(map[m.size - 1][0]).toBeNull();
  });

  it('starts at (size-1, size-1) with bit 7 of stream codeword 0', () => {
    const m = buildMatrix('https://www.instagram.com/ntu_astro/');
    const map = buildModuleStreamMap(m);
    const pos = map[m.size - 1][m.size - 1];
    expect(pos).not.toBeNull();
    expect(pos!.streamIdx).toBe(0);
    expect(pos!.bitInCodeword).toBe(7);
  });
});
