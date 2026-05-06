import QRCode from 'qrcode';
import type { QRMatrix } from '../types';
import { QR_ECC_LEVEL } from '../types';

const FINDER_SIZE = 7;
const SEPARATOR = 1;

const ALIGNMENT_PATTERN_TABLE: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
  [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
  [6, 34, 62, 90],
];

function versionFromSize(size: number): number {
  return (size - 17) / 4;
}

function setReservedRect(mask: boolean[][], x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy >= 0 && yy < mask.length && xx >= 0 && xx < mask[0].length) {
        mask[yy][xx] = true;
      }
    }
  }
}

function buildReservedMask(size: number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  // Three finder patterns + their separators (one-pixel quiet ring)
  const span = FINDER_SIZE + SEPARATOR;
  setReservedRect(mask, 0, 0, span, span);                       // top-left
  setReservedRect(mask, size - span, 0, span, span);             // top-right
  setReservedRect(mask, 0, size - span, span, span);             // bottom-left

  // Timing patterns (row 6 and column 6)
  for (let i = 0; i < size; i++) {
    mask[6][i] = true;
    mask[i][6] = true;
  }

  // Format-info bands (15 modules each, around top-left and split between top-right + bottom-left)
  for (let i = 0; i <= 8; i++) {
    mask[8][i] = true;
    mask[i][8] = true;
    mask[8][size - 1 - i] = true;
    mask[size - 1 - i][8] = true;
  }

  const version = versionFromSize(size);
  // Alignment patterns
  if (version >= 2 && version < ALIGNMENT_PATTERN_TABLE.length) {
    const positions = ALIGNMENT_PATTERN_TABLE[version];
    for (const r of positions) {
      for (const c of positions) {
        // Skip alignment patterns that overlap finder patterns
        const overlapsFinder =
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 9) ||
          (r >= size - 9 && c <= 8);
        if (overlapsFinder) continue;
        setReservedRect(mask, c - 2, r - 2, 5, 5);
      }
    }
  }

  // Version-info bands for v7+
  if (version >= 7) {
    setReservedRect(mask, size - 11, 0, 3, 6);
    setReservedRect(mask, 0, size - 11, 6, 3);
  }

  return mask;
}

export function buildMatrix(text: string): QRMatrix {
  const input = text.length === 0 ? ' ' : text;
  const qr = QRCode.create(input, { errorCorrectionLevel: QR_ECC_LEVEL });
  const size: number = qr.modules.size;
  const bitMatrix = qr.modules as unknown as {
    size: number;
    get?: (x: number, y: number) => number;
    data: Uint8Array;
  };
  const get = typeof bitMatrix.get === 'function'
    ? (x: number, y: number) => Boolean(bitMatrix.get!(x, y))
    : (x: number, y: number) => Boolean(bitMatrix.data[y * size + x]);

  const modules: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      row.push(get(x, y));
    }
    modules.push(row);
  }

  return {
    size,
    modules,
    reservedMask: buildReservedMask(size),
  };
}
