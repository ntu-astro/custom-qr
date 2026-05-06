import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { verify } from './scanVerifier';

async function renderKnownQr(text: string, modulePx = 8): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'H',
    margin: 4,
    scale: modulePx,
    color: { dark: '#000000', light: '#ffffff' },
  });
  return canvas;
}

describe('verify', () => {
  it('decodes a clean QR at full size', async () => {
    const canvas = await renderKnownQr('https://ntuastro.com', 8);
    const results = verify(canvas, [canvas.width]);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://ntuastro.com');
  });

  it('decodes when downscaled to 200px', async () => {
    const canvas = await renderKnownQr('https://ntuastro.com', 12);
    const results = verify(canvas, [200]);
    expect(results[0].ok).toBe(true);
    expect(results[0].decoded).toBe('https://ntuastro.com');
  });

  it('returns ok:false for a noise canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(200, 200);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const results = verify(canvas, [200]);
    expect(results[0].ok).toBe(false);
  });
});
