/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TEMPLATES } from '../templates/presets';
import { TemplatePicker } from './TemplatePicker';

describe('TemplatePicker', () => {
  it('renders one tile per preset plus the upload tile', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    const tiles = screen.getAllByRole('button');
    // TEMPLATES.length preset tiles + 1 upload tile.
    expect(tiles).toHaveLength(TEMPLATES.length + 1);
    for (const preset of TEMPLATES) {
      expect(
        screen.getByRole('button', { name: preset.displayName }),
      ).toBeInTheDocument();
    }
    // The upload tile's accessible name is "+ Upload" (the "+" span and the
    // label span are concatenated by the accessibility tree).
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument();
  });

  it('marks the selected tile with aria-pressed="true" and others with "false"', () => {
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    const ntuasTile = screen.getByRole('button', { name: 'NTUAS' });
    expect(ntuasTile).toHaveAttribute('aria-pressed', 'true');
    const orionTile = screen.getByRole('button', { name: 'Orion' });
    expect(orionTile).toHaveAttribute('aria-pressed', 'false');
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

  it('fires onUploadClick when the upload tile is clicked', () => {
    const onUploadClick = vi.fn();
    render(
      <TemplatePicker
        selectedId="ntuas"
        onSelect={vi.fn()}
        onUploadClick={onUploadClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Upload/ }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('renders the customSourceLabel on the upload tile when provided', () => {
    render(
      <TemplatePicker
        selectedId="custom"
        customSourceLabel="myfile.png"
        onSelect={vi.fn()}
        onUploadClick={vi.fn()}
      />,
    );
    // The upload tile's accessible name concatenates "+" and the label span.
    const tile = screen.getByRole('button', { name: /myfile\.png/ });
    expect(tile).toBeInTheDocument();
    // The upload tile is selected.
    expect(tile).toHaveAttribute('aria-pressed', 'true');
  });
});
