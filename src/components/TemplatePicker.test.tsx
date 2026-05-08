/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TEMPLATES } from '../templates/presets';
import { TemplatePicker } from './TemplatePicker';

describe('TemplatePicker — tabs', () => {
  it('renders Astronomy / Art / Custom tabs', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Astronomy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Art' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
  });

  it('selects the Astronomy tab when an astronomy preset is the active template', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Astronomy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'false');
  });

  it('selects the Custom tab when templateId is "custom"', () => {
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="logo.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Astronomy' })).toHaveAttribute('aria-selected', 'false');
  });

  it('switches tab content when a different tab is clicked', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    // Initial: Astronomy panel visible.
    expect(screen.getByRole('tabpanel', { name: 'Astronomy templates' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Art templates' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Art' }));

    expect(screen.getByRole('tabpanel', { name: 'Art templates' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Astronomy templates' })).toBeNull();
  });
});

describe('TemplatePicker — Astronomy tab', () => {
  it('renders one tile per astronomy preset', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    const astronomyPresets = TEMPLATES.filter((t) => t.category === 'astronomy');
    for (const preset of astronomyPresets) {
      expect(
        screen.getByRole('button', { name: preset.displayName }),
      ).toBeInTheDocument();
    }
  });

  it('marks the selected tile with aria-pressed="true"', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'NTUAS' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Orion' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onSelect with the preset id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={onSelect}
        onUploadClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Earth' }));
    expect(onSelect).toHaveBeenCalledWith('earth');
  });
});

describe('TemplatePicker — Art tab', () => {
  it('renders a tile for every art-category preset', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Art' }));
    const panel = screen.getByRole('tabpanel', { name: 'Art templates' });
    expect(panel).toBeInTheDocument();

    const artPresets = TEMPLATES.filter((t) => t.category === 'art');
    expect(artPresets.length).toBeGreaterThan(0);
    for (const preset of artPresets) {
      expect(screen.getByRole('button', { name: preset.displayName })).toBeInTheDocument();
    }
  });

  it('selects an art preset when its tile is clicked', () => {
    const onSelect = vi.fn();
    const firstArt = TEMPLATES.find((t) => t.category === 'art');
    expect(firstArt).toBeDefined();
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={onSelect}
        onUploadClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Art' }));
    fireEvent.click(screen.getByRole('button', { name: firstArt!.displayName }));
    expect(onSelect).toHaveBeenCalledWith(firstArt!.id);
  });
});

describe('TemplatePicker — Custom tab empty state', () => {
  it('renders the heading, subtext, and Choose image CTA when no source is uploaded', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByRole('heading', { name: 'Bring your own image' })).toBeInTheDocument();
    expect(screen.getByText(/turn it into a working QR/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument();
  });

  it('does not render the upload tile or crop toggle in the empty state', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        onCustomCropToSquareChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Custom image crop' })).toBeNull();
  });

  it('fires onUploadClick when the Choose image CTA is clicked', () => {
    const onUploadClick = vi.fn();
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={onUploadClick}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });
});

describe('TemplatePicker — Custom tab (after upload)', () => {
  it('replaces the empty state with an image preview once a source is loaded', () => {
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        customSourceDataUrl="data:image/png;base64,IAMTHEPREVIEW"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Bring your own image' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose image' })).toBeNull();
    // Preview button is labelled by the replace action; the filename caption
    // sits beneath it.
    const replace = screen.getByRole('button', { name: /Replace image \(current: myfile\.png\)/ });
    expect(replace).toBeInTheDocument();
    const img = replace.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,IAMTHEPREVIEW');
  });

  it('renders the filename caption below the preview', () => {
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        customSourceDataUrl="data:image/png;base64,IAMTHEPREVIEW"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    // The filename is also visible as a caption (separate from the
    // accessible-name on the preview button).
    expect(screen.getByText('myfile.png')).toBeInTheDocument();
  });

  it('fires onUploadClick when the preview is clicked (replace flow)', () => {
    const onUploadClick = vi.fn();
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        customSourceDataUrl="data:image/png;base64,IAMTHEPREVIEW"
        onSelect={vi.fn()}
        onUploadClick={onUploadClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Replace image/ }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('renders the preview button without an <img> if the data URL is missing', () => {
    // Defensive: cache miss shouldn't normally happen, but the UI shouldn't
    // crash if it does.
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    const replace = screen.getByRole('button', { name: /Replace image/ });
    expect(replace.querySelector('img')).toBeNull();
  });

  it('uses object-contain on the preview when cropToSquare is false and object-cover when true (WYSIWYG of pipeline crop)', () => {
    const { rerender } = render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        customSourceDataUrl="data:image/png;base64,IAMTHEPREVIEW"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={false}
        onCustomCropToSquareChange={vi.fn()}
      />,
    );
    let img = screen.getByRole('button', { name: /Replace image/ }).querySelector('img');
    expect(img?.className).toContain('object-contain');
    expect(img?.className).not.toContain('object-cover');

    rerender(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        customSourceDataUrl="data:image/png;base64,IAMTHEPREVIEW"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={true}
        onCustomCropToSquareChange={vi.fn()}
      />,
    );
    img = screen.getByRole('button', { name: /Replace image/ }).querySelector('img');
    expect(img?.className).toContain('object-cover');
    expect(img?.className).not.toContain('object-contain');
  });

  it('renders the crop toggle (Original | Square) only when a source is loaded and the change handler is provided', () => {
    const onCustomCropToSquareChange = vi.fn();
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={false}
        onCustomCropToSquareChange={onCustomCropToSquareChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Custom image crop' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Square' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects customCropToSquare=true with Square checked', () => {
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={true}
        onCustomCropToSquareChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Square' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onCustomCropToSquareChange(true) when Square is clicked', () => {
    const onCustomCropToSquareChange = vi.fn();
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={false}
        onCustomCropToSquareChange={onCustomCropToSquareChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Square' }));
    expect(onCustomCropToSquareChange).toHaveBeenCalledWith(true);
  });

  it('fires onCustomCropToSquareChange(false) when Original is clicked', () => {
    const onCustomCropToSquareChange = vi.fn();
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
        customCropToSquare={true}
        onCustomCropToSquareChange={onCustomCropToSquareChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Original' }));
    expect(onCustomCropToSquareChange).toHaveBeenCalledWith(false);
  });
});
