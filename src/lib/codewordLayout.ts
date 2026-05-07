/** Module → codeword inverse layout for ECC-H QR codes.
 *
 *  The qrcode library produces a final bitmap by:
 *    1. Building a Reed-Solomon-encoded codeword stream (data block-1, data
 *       block-2, ..., ECC block-1, ECC block-2, ... — interleaved by row).
 *    2. Walking a 2-column zigzag from (size-1, size-1) up the right edge,
 *       skipping the column-6 timing pattern, and placing 8 bits per codeword
 *       into the next consecutive non-reserved modules.
 *
 *  This module inverts that mapping. For each non-reserved module it tells
 *  you which RS block / position-in-block / bit-in-codeword owns that pixel.
 *  Stage 3 uses it to budget module flips per RS block (the Reed-Solomon
 *  error-correction limit is ⌊ecCount/2⌋ codeword errors per block; flipping
 *  individual bits across many codewords burns the budget too fast). */

import type { QRMatrix } from '../types';

/** Total codewords (data + ECC) per QR version, indexed by version 1..40. */
const CODEWORDS_TOTAL: readonly number[] = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

/** Number of ECC codewords for level H per version. */
const ECC_CODEWORDS_H: readonly number[] = [
  0, 17, 28, 44, 64, 88, 112, 130, 156, 192, 224,
  264, 308, 352, 384, 432, 480, 532, 588, 650, 700,
  750, 816, 900, 960, 1050, 1110, 1200, 1260, 1350, 1440,
  1530, 1620, 1710, 1800, 1890, 1980, 2100, 2220, 2310, 2430,
];

/** Number of RS blocks for level H per version. */
const ECC_BLOCKS_H: readonly number[] = [
  0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8,
  11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
  25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
  51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
];

export interface EccLayout {
  version: number;
  size: number;
  totalCodewords: number;
  dataTotalCodewords: number;
  ecTotalBlocks: number;
  /** Blocks in group 1 use shorter data length (`dataCodewordsInGroup1`). */
  blocksInGroup1: number;
  /** Blocks in group 2 carry one extra data codeword. */
  blocksInGroup2: number;
  dataCodewordsInGroup1: number;
  dataCodewordsInGroup2: number;
  /** ECC codewords per block (constant across blocks). */
  ecCount: number;
}

export function getEccLayoutForH(matrixSize: number): EccLayout {
  const version = (matrixSize - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) {
    throw new Error(`Invalid matrix size for ECC-H: ${matrixSize}`);
  }
  const totalCodewords = CODEWORDS_TOTAL[version];
  const ecTotalCodewords = ECC_CODEWORDS_H[version];
  const dataTotalCodewords = totalCodewords - ecTotalCodewords;
  const ecTotalBlocks = ECC_BLOCKS_H[version];
  const blocksInGroup2 = totalCodewords % ecTotalBlocks;
  const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
  const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
  const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
  const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
  const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
  return {
    version, size: matrixSize, totalCodewords, dataTotalCodewords, ecTotalBlocks,
    blocksInGroup1, blocksInGroup2, dataCodewordsInGroup1, dataCodewordsInGroup2,
    ecCount,
  };
}

export interface BlockPosition {
  /** RS block index in [0, ecTotalBlocks). */
  block: number;
  /** True if this is an ECC codeword; false for data codewords. */
  isEcc: boolean;
  /** Codeword position within its block (0-indexed). */
  posInBlock: number;
}

/** Walk forward through the data + ECC interleave to map a stream codeword
 *  index back to (block, isEcc, posInBlock). O(streamIdx) per call; for hot
 *  loops use `buildStreamIndexToBlockTable` below to precompute. */
export function streamIndexToBlock(streamIdx: number, layout: EccLayout): BlockPosition {
  const dataInterleavedTotal = layout.dataTotalCodewords;
  if (streamIdx < 0 || streamIdx >= layout.totalCodewords) {
    throw new Error(`streamIdx ${streamIdx} out of range [0, ${layout.totalCodewords})`);
  }
  if (streamIdx < dataInterleavedTotal) {
    let idx = 0;
    const maxDataSize = layout.dataCodewordsInGroup2;
    for (let i = 0; i < maxDataSize; i++) {
      for (let r = 0; r < layout.ecTotalBlocks; r++) {
        const dataLen = r < layout.blocksInGroup1
          ? layout.dataCodewordsInGroup1
          : layout.dataCodewordsInGroup2;
        if (i >= dataLen) continue;
        if (idx === streamIdx) return { block: r, isEcc: false, posInBlock: i };
        idx++;
      }
    }
    throw new Error('unreachable');
  }
  const eccLocal = streamIdx - dataInterleavedTotal;
  const i = Math.floor(eccLocal / layout.ecTotalBlocks);
  const r = eccLocal % layout.ecTotalBlocks;
  return { block: r, isEcc: true, posInBlock: i };
}

export function buildStreamIndexToBlockTable(layout: EccLayout): BlockPosition[] {
  const out: BlockPosition[] = new Array(layout.totalCodewords);
  let idx = 0;
  const maxDataSize = layout.dataCodewordsInGroup2;
  for (let i = 0; i < maxDataSize; i++) {
    for (let r = 0; r < layout.ecTotalBlocks; r++) {
      const dataLen = r < layout.blocksInGroup1
        ? layout.dataCodewordsInGroup1
        : layout.dataCodewordsInGroup2;
      if (i >= dataLen) continue;
      out[idx++] = { block: r, isEcc: false, posInBlock: i };
    }
  }
  for (let i = 0; i < layout.ecCount; i++) {
    for (let r = 0; r < layout.ecTotalBlocks; r++) {
      out[idx++] = { block: r, isEcc: true, posInBlock: i };
    }
  }
  return out;
}

export interface ModuleStreamPos {
  /** Codeword index in the post-interleave stream (0..totalCodewords-1). */
  streamIdx: number;
  /** Bit position within the codeword: 7 = MSB, 0 = LSB. */
  bitInCodeword: number;
}

/** For each non-reserved module of `matrix`, compute its (streamIdx,
 *  bitInCodeword). Returns null for reserved modules and for any "remainder
 *  bits" past the last codeword.
 *
 *  Walks the canonical 2-column zigzag from (size-1, size-1) upward, skipping
 *  the column-6 timing pattern. Identical to qrcode's setupData() iteration.
 *  Reserved-ness is read from `matrix.reserved` (== 1).
 *
 *  Per ISO/IEC 18004 §8.7.2, some QR versions have a tail of "remainder bits"
 *  past `totalCodewords × 8` (e.g. version 3 has 7). qrcode sets those to 0
 *  but they are not part of any codeword — we return null for them so Stage 3
 *  never tries to flip them. */
export function buildModuleStreamMap(matrix: QRMatrix): (ModuleStreamPos | null)[][] {
  const size = matrix.size;
  const layout = getEccLayoutForH(size);
  const out: (ModuleStreamPos | null)[][] = Array.from({ length: size }, () =>
    new Array<ModuleStreamPos | null>(size).fill(null),
  );
  let inc = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (matrix.reserved[row * size + cc] === 0) {
          if (byteIndex < layout.totalCodewords) {
            out[row][cc] = { streamIdx: byteIndex, bitInCodeword: bitIndex };
          }
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || size <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
  return out;
}
