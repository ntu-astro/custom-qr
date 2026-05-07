import QRCode from 'qrcode';
import type { MaskPattern, QRMatrix } from '../types';
import { QR_ECC_LEVEL } from '../types';

export interface BuildMatrixOptions {
  /** Override the QR mask pattern (0..7). Default: let qrcode auto-pick. */
  maskPattern?: MaskPattern;
}

export function buildMatrix(text: string, options: BuildMatrixOptions = {}): QRMatrix {
  const input = text.length === 0 ? ' ' : text;
  const qr = options.maskPattern !== undefined
    ? QRCode.create(input, {
        errorCorrectionLevel: QR_ECC_LEVEL,
        maskPattern: options.maskPattern,
      })
    : QRCode.create(input, { errorCorrectionLevel: QR_ECC_LEVEL });
  const size: number = qr.modules.size;
  // qrcode's BitMatrix tracks `reservedBit[y*size + x] === 1` for every
  // structurally-required module (finder, separator, timing, alignment,
  // format-info, version-info) as it builds the symbol. We use that as our
  // importance-map "0 = excluded" signal — canonical, no risk of geometric
  // mismatches with qrcode's own data placement.
  const bitMatrix = qr.modules as unknown as {
    size: number;
    get?: (x: number, y: number) => number;
    data: Uint8Array;
    reservedBit: Uint8Array;
  };
  if (!(bitMatrix.reservedBit instanceof Uint8Array) || bitMatrix.reservedBit.length !== size * size) {
    throw new Error(
      'qrcode internal BitMatrix layout changed: reservedBit missing or wrong length. ' +
      'Please update src/lib/qrMatrix.ts to match the new internals.'
    );
  }
  const get = typeof bitMatrix.get === 'function'
    ? (x: number, y: number) => Boolean(bitMatrix.get!(x, y))
    : (x: number, y: number) => Boolean(bitMatrix.data[y * size + x]);

  const modules: boolean[][] = [];
  const importance: number[][] = [];
  for (let y = 0; y < size; y++) {
    const moduleRow: boolean[] = [];
    const importanceRow: number[] = [];
    for (let x = 0; x < size; x++) {
      moduleRow.push(get(x, y));
      // qrcode uses (row, col) ordering for its reservedBit; row=y, col=x.
      importanceRow.push(bitMatrix.reservedBit[y * size + x] ? 0 : 1);
    }
    modules.push(moduleRow);
    importance.push(importanceRow);
  }

  return { size, modules, importance };
}
