/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock useQrPipeline so the entire halftone math stack stays out of the App
// integration tests. The mock can be reconfigured per-test via the spy below.
interface MockedPipelineState {
  qrCanvas: HTMLCanvasElement | null;
  scanResults: never[];
  isRendering: boolean;
  pipelineError: string | undefined;
}

const useQrPipelineMock = vi.fn<() => MockedPipelineState>(() => ({
  qrCanvas: null,
  scanResults: [],
  isRendering: false,
  pipelineError: undefined,
}));

vi.mock('./hooks/useQrPipeline', () => ({
  useQrPipeline: () => useQrPipelineMock(),
}));

// composer is invoked from a useMemo with qrCanvas as a dep; the mock returns
// null qrCanvas by default so composePoster never runs. We still mock to be
// safe in case a test sets a non-null canvas.
vi.mock('./lib/composer', () => ({
  composePoster: vi.fn(() => null),
}));

import App from './App';

describe('App — header', () => {
  beforeEach(() => {
    useQrPipelineMock.mockReset();
    useQrPipelineMock.mockReturnValue({
      qrCanvas: null,
      scanResults: [],
      isRendering: false,
      pipelineError: undefined,
    });
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  it('renders the "Astro QR" heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Astro QR' })).toBeInTheDocument();
  });

  it('renders the description copy', () => {
    render(<App />);
    expect(
      screen.getByText(
        'Halftone-style QR codes for NTU Astronomical Society. No backend, no tracking.',
      ),
    ).toBeInTheDocument();
  });
});

describe('App — upload validation', () => {
  beforeEach(() => {
    useQrPipelineMock.mockReset();
    useQrPipelineMock.mockReturnValue({
      qrCanvas: null,
      scanResults: [],
      isRendering: false,
      pipelineError: undefined,
    });
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  it('shows a size error when a Decode QR upload exceeds 10MB', async () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('#decode-qr-upload')!;
    // jsdom's File polyfill may not faithfully reflect byte length on its
    // .size getter; force the property so the size check fires deterministically.
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'File is larger than 10MB. Pick a smaller image.',
      );
    });
  });

  it('shows a MIME error when a Decode QR upload is not PNG/JPG/WebP', async () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('#decode-qr-upload')!;
    const bad = new File(['hello'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only PNG, JPG, or WebP images can be decoded.',
      );
    });
  });

  it('shows a MIME error when a Custom upload is a GIF', async () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('#custom-source-upload')!;
    const bad = new File(['gif'], 'image.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only PNG, JPG, WebP, or SVG uploads are supported.',
      );
    });
  });
});

describe('App — pipeline error surfacing', () => {
  beforeEach(() => {
    useQrPipelineMock.mockReset();
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      localStorage.removeItem('astro-qr:v1');
    } catch {
      // ignore
    }
  });

  it('renders pipelineError text in the alert when no upload error is present', () => {
    useQrPipelineMock.mockReturnValue({
      qrCanvas: null,
      scanResults: [],
      isRendering: false,
      pipelineError: 'something bad',
    });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('something bad');
  });

  it('prefers the upload error over a concurrent pipeline error', async () => {
    useQrPipelineMock.mockReturnValue({
      qrCanvas: null,
      scanResults: [],
      isRendering: false,
      pipelineError: 'pipeline says nope',
    });
    const { container } = render(<App />);
    // Trigger an upload-validation error.
    const input = container.querySelector<HTMLInputElement>('#decode-qr-upload')!;
    const bad = new File(['x'], 'x.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only PNG, JPG, or WebP images can be decoded.',
      );
    });
    // The pipeline error should be hidden behind the upload error.
    expect(screen.getByRole('alert')).not.toHaveTextContent('pipeline says nope');
  });
});
