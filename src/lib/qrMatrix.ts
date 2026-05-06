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

function paintRect(map: number[][], value: number, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy >= 0 && yy < map.length && xx >= 0 && xx < map[0].length) {
        map[yy][xx] = value;
      }
    }
  }
}

/** Build the per-module importance map (Chu et al. 2013 §4.1).
 *  Function-pattern modules (finder, separator, timing, alignment, format-info,
 *  version-info) get importance 0 — they are structurally required and excluded
 *  from any optimisation.
 *  Data modules get importance 1.0 by default; the image-weighted version is
 *  applied separately by the importance-map pre-pass once the dithered target
 *  is available. */
function buildImportanceMap(size: number): number[][] {
  const map: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(1),
  );

  const span = FINDER_SIZE + SEPARATOR;
  paintRect(map, 0, 0, 0, span, span);                       // top-left finder
  paintRect(map, 0, size - span, 0, span, span);             // top-right finder
  paintRect(map, 0, 0, size - span, span, span);             // bottom-left finder

  // Timing patterns (row 6 and column 6)
  for (let i = 0; i < size; i++) {
    map[6][i] = 0;
    map[i][6] = 0;
  }

  // Format-info bands
  for (let i = 0; i <= 8; i++) {
    map[8][i] = 0;
    map[i][8] = 0;
    map[8][size - 1 - i] = 0;
    map[size - 1 - i][8] = 0;
  }

  const version = versionFromSize(size);
  if (version >= 2 && version < ALIGNMENT_PATTERN_TABLE.length) {
    const positions = ALIGNMENT_PATTERN_TABLE[version];
    for (const r of positions) {
      for (const c of positions) {
        const overlapsFinder =
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= size - 9) ||
          (r >= size - 9 && c <= 8);
        if (overlapsFinder) continue;
        paintRect(map, 0, c - 2, r - 2, 5, 5);
      }
    }
  }

  if (version >= 7) {
    paintRect(map, 0, size - 11, 0, 3, 6);
    paintRect(map, 0, 0, size - 11, 6, 3);
  }

  return map;
}

export interface BuildMatrixOptions {
  /** Override the QR mask pattern (0..7). Default: let qrcode auto-pick. */
  maskPattern?: number;
}

export function buildMatrix(text: string, options: BuildMatrixOptions = {}): QRMatrix {
  const input = text.length === 0 ? ' ' : text;
  const qr = options.maskPattern !== undefined
    ? QRCode.create(input, {
        errorCorrectionLevel: QR_ECC_LEVEL,
        maskPattern: options.maskPattern as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      })
    : QRCode.create(input, { errorCorrectionLevel: QR_ECC_LEVEL });
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
    importance: buildImportanceMap(size),
  };
}
