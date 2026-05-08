/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Controls } from './Controls';

interface RenderOpts {
  url?: string;
  caption?: string;
  templateId?: string;
  multiSize?: boolean;
  silhouetteScale?: number;
  customSourceLabel?: string;
  customCropToSquare?: boolean;
}

function renderControls(
  overrides: RenderOpts = {},
  callbacks: {
    onUrlChange?: (v: string) => void;
    onCaptionChange?: (v: string) => void;
    onTemplateSelect?: (id: string) => void;
    onAdvancedChange?: () => void;
    onCustomUpload?: (f: File) => void;
    onDecodeQrUpload?: (f: File) => void;
    onCustomCropToSquareChange?: (v: boolean) => void;
  } = {},
) {
  return render(
    <Controls
      url={overrides.url ?? ''}
      onUrlChange={callbacks.onUrlChange ?? vi.fn()}
      templateId={overrides.templateId ?? 'ntuas'}
      onTemplateSelect={callbacks.onTemplateSelect ?? vi.fn()}
      customSourceLabel={overrides.customSourceLabel}
      customCropToSquare={overrides.customCropToSquare}
      onCustomCropToSquareChange={callbacks.onCustomCropToSquareChange}
      caption={overrides.caption ?? ''}
      onCaptionChange={callbacks.onCaptionChange ?? vi.fn()}
      multiSize={overrides.multiSize ?? false}
      silhouetteScale={overrides.silhouetteScale ?? 1}
      renderMode="halftone"
      filter="color"
      onAdvancedChange={callbacks.onAdvancedChange ?? vi.fn()}
      onCustomUpload={callbacks.onCustomUpload ?? vi.fn()}
      onDecodeQrUpload={callbacks.onDecodeQrUpload ?? vi.fn()}
    />,
  );
}

describe('Controls', () => {
  it('fires onUrlChange when typing into the URL input', () => {
    const onUrlChange = vi.fn();
    renderControls({}, { onUrlChange });
    const input = screen.getByPlaceholderText('https://www.instagram.com/ntu_astro/');
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    expect(onUrlChange).toHaveBeenCalledWith('https://example.com');
  });

  it('fires onCaptionChange when typing into the caption input and enforces maxLength=120', () => {
    const onCaptionChange = vi.fn();
    renderControls({}, { onCaptionChange });
    const caption = screen.getByPlaceholderText('NTU Astro · 2026') as HTMLInputElement;
    fireEvent.change(caption, { target: { value: 'hello world' } });
    expect(onCaptionChange).toHaveBeenCalledWith('hello world');
    expect(caption.maxLength).toBe(120);
  });

  it('renders a hidden file input wired for the Decode QR button', () => {
    const { container } = renderControls();
    const input = container.querySelector<HTMLInputElement>('#decode-qr-upload');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  });

  it('invokes onDecodeQrUpload when a file is chosen via the decode-qr-upload input', () => {
    const onDecodeQrUpload = vi.fn();
    const { container } = renderControls({}, { onDecodeQrUpload });
    const input = container.querySelector<HTMLInputElement>('#decode-qr-upload')!;
    const file = new File(['fake'], 'qr.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onDecodeQrUpload).toHaveBeenCalledTimes(1);
    expect(onDecodeQrUpload).toHaveBeenCalledWith(file);
  });

  it('invokes onCustomUpload when a file is chosen via the custom-source-upload input', () => {
    const onCustomUpload = vi.fn();
    const { container } = renderControls({}, { onCustomUpload });
    const input = container.querySelector<HTMLInputElement>('#custom-source-upload')!;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', 'image/png,image/svg+xml,image/jpeg,image/webp');
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onCustomUpload).toHaveBeenCalledTimes(1);
    expect(onCustomUpload).toHaveBeenCalledWith(file);
  });

  it('fires onTemplateSelect with the preset id when a template tile is clicked', () => {
    const onTemplateSelect = vi.fn();
    renderControls({}, { onTemplateSelect });
    fireEvent.click(screen.getByRole('button', { name: 'Orion' }));
    expect(onTemplateSelect).toHaveBeenCalledWith('orion');
  });

  it('renders the Advanced options details with the silhouette slider inside', () => {
    renderControls();
    expect(screen.getByText('Advanced options')).toBeInTheDocument();
    // The slider lives inside the details panel; jsdom always renders contents
    // regardless of <details open> state, so we can query directly.
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('type', 'range');
  });

  describe('Custom crop toggle wiring (toggle UI itself is exercised in TemplatePicker tests)', () => {
    it('threads customCropToSquare and onCustomCropToSquareChange through to the Custom tab', () => {
      // When templateId === 'custom' and a source label is present, the
      // TemplatePicker auto-selects the Custom tab and renders the toggle
      // with the props Controls passed through.
      const onCustomCropToSquareChange = vi.fn();
      renderControls(
        { templateId: 'custom', customSourceLabel: 'logo.png', customCropToSquare: true },
        { onCustomCropToSquareChange },
      );
      const square = screen.getByRole('radio', { name: 'Square' });
      expect(square).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(screen.getByRole('radio', { name: 'Original' }));
      expect(onCustomCropToSquareChange).toHaveBeenCalledWith(false);
    });
  });
});
