import '@testing-library/jest-dom/vitest';
import { ImageData as CanvasImageData } from 'canvas';

// jsdom does not implement ImageData by default. Expose the `canvas`-package
// implementation globally so tests that build ImageData fixtures work.
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as unknown as { ImageData: typeof CanvasImageData }).ImageData =
    CanvasImageData;
}
