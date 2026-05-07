/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PosterSize, ScanResult } from '../types';
import { QrPreview } from './QrPreview';

interface PreviewOverrides {
  qrCanvas?: HTMLCanvasElement | null;
  posterCanvas?: HTMLCanvasElement | null;
  scanResults?: ScanResult[];
  multiSize?: boolean;
  posterSize?: PosterSize;
  isRendering?: boolean;
  errorMessage?: string;
  onPosterSizeChange?: (s: PosterSize) => void;
}

const igPost: PosterSize = { kind: 'igPost', width: 1080, height: 1080 };

function renderPreview(overrides: PreviewOverrides = {}) {
  return render(
    <QrPreview
      qrCanvas={overrides.qrCanvas ?? null}
      posterCanvas={overrides.posterCanvas ?? null}
      scanResults={overrides.scanResults ?? []}
      multiSize={overrides.multiSize ?? false}
      posterSize={overrides.posterSize ?? igPost}
      onPosterSizeChange={overrides.onPosterSizeChange ?? vi.fn()}
      isRendering={overrides.isRendering ?? false}
      errorMessage={overrides.errorMessage}
    />,
  );
}

/** Locate the mount div: the parent of the canvas, or the [aria-live='polite']
 *  region when no canvas is mounted. */
function getMountDiv(container: HTMLElement): HTMLDivElement {
  const mount = container.querySelector<HTMLDivElement>('[aria-live="polite"]');
  if (!mount) throw new Error('Mount div not found');
  return mount;
}

describe('QrPreview — canvas mounting', () => {
  it('renders an empty mount div when qrCanvas is null', () => {
    const { container } = renderPreview({ qrCanvas: null });
    const mount = getMountDiv(container);
    expect(mount.children).toHaveLength(0);
  });

  it('appends the qrCanvas to the mount div when provided', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const { container } = renderPreview({ qrCanvas: canvas });
    const mount = getMountDiv(container);
    expect(mount.firstElementChild).toBe(canvas);
  });

  it('replaces the canvas when qrCanvas changes', () => {
    const canvas1 = document.createElement('canvas');
    const canvas2 = document.createElement('canvas');
    const { container, rerender } = renderPreview({ qrCanvas: canvas1 });
    const mount = getMountDiv(container);
    expect(mount.firstElementChild).toBe(canvas1);

    rerender(
      <QrPreview
        qrCanvas={canvas2}
        posterCanvas={null}
        scanResults={[]}
        multiSize={false}
        posterSize={igPost}
        onPosterSizeChange={vi.fn()}
        isRendering={false}
      />,
    );
    expect(mount.children).toHaveLength(1);
    expect(mount.firstElementChild).toBe(canvas2);
  });

  it('adds animate-pulse class to the mount div when isRendering is true', () => {
    const { container } = renderPreview({ isRendering: true });
    const mount = getMountDiv(container);
    expect(mount.className).toContain('animate-pulse');
  });
});

describe('QrPreview — download buttons', () => {
  it('disables all download buttons when qrCanvas is null', () => {
    renderPreview({ qrCanvas: null, posterCanvas: null });
    expect(screen.getByRole('button', { name: 'QR only (PNG)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'QR only (SVG)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Poster (PNG)' })).toBeDisabled();
  });

  it('enables all download buttons when both canvases are provided', () => {
    const qr = document.createElement('canvas');
    const poster = document.createElement('canvas');
    renderPreview({ qrCanvas: qr, posterCanvas: poster });
    expect(screen.getByRole('button', { name: 'QR only (PNG)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'QR only (SVG)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Poster (PNG)' })).toBeEnabled();
  });

  it('disables Poster (PNG) when posterCanvas is null but enables PNG/SVG when qrCanvas is provided', () => {
    const qr = document.createElement('canvas');
    renderPreview({ qrCanvas: qr, posterCanvas: null });
    expect(screen.getByRole('button', { name: 'QR only (PNG)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'QR only (SVG)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Poster (PNG)' })).toBeDisabled();
  });
});

describe('QrPreview — error and scan badge', () => {
  it('shows an alert with the errorMessage and hides the ScanBadge', () => {
    renderPreview({ errorMessage: 'oops', scanResults: [{ size: 1080, ok: true }] });
    expect(screen.getByRole('alert')).toHaveTextContent('oops');
    expect(screen.queryByText(/Scannable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/May not scan reliably/)).not.toBeInTheDocument();
  });
});

describe('QrPreview — poster size picker', () => {
  it('calls onPosterSizeChange with the matching preset when select changes to igStory', () => {
    const onPosterSizeChange = vi.fn();
    renderPreview({ onPosterSizeChange });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'igStory' } });
    expect(onPosterSizeChange).toHaveBeenCalledWith({
      kind: 'igStory',
      width: 1080,
      height: 1920,
    });
  });

  it('switches to a custom size object when select changes to "custom"', () => {
    const onPosterSizeChange = vi.fn();
    renderPreview({ onPosterSizeChange });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'custom' } });
    expect(onPosterSizeChange).toHaveBeenCalledWith({
      kind: 'custom',
      width: 1080,
      height: 1080,
    });
  });

  it('clamps custom width through clampSide when typing a value above the upper bound', () => {
    const onPosterSizeChange = vi.fn();
    const customSize: PosterSize = { kind: 'custom', width: 1080, height: 1080 };
    renderPreview({ posterSize: customSize, onPosterSizeChange });
    // First number input is width, second is height.
    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => (el as HTMLInputElement).type === 'number');
    expect(numberInputs).toHaveLength(2);
    const widthInput = numberInputs[0] as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '99999' } });
    // clampSide caps at 8000.
    expect(onPosterSizeChange).toHaveBeenCalledWith({
      kind: 'custom',
      width: 8000,
      height: 1080,
    });
  });

  it('clamps custom height through clampSide when typing a value below the lower bound', () => {
    const onPosterSizeChange = vi.fn();
    const customSize: PosterSize = { kind: 'custom', width: 1080, height: 1080 };
    renderPreview({ posterSize: customSize, onPosterSizeChange });
    const numberInputs = screen
      .getAllByRole('spinbutton')
      .filter((el) => (el as HTMLInputElement).type === 'number');
    const heightInput = numberInputs[1] as HTMLInputElement;
    fireEvent.change(heightInput, { target: { value: '10' } });
    // clampSide floors at 64.
    expect(onPosterSizeChange).toHaveBeenCalledWith({
      kind: 'custom',
      width: 1080,
      height: 64,
    });
  });
});
