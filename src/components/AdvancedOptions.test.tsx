/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedOptions } from './AdvancedOptions';

describe('AdvancedOptions', () => {
  it('renders the silhouette scale as a percentage', () => {
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={0.7} renderMode="halftone" filter="color" onChange={vi.fn()} />,
    );
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('calls onChange with silhouetteScale fraction when slider changes', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={0.7} renderMode="halftone" filter="color" onChange={onChange} />,
    );
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '80' } });
    expect(onChange).toHaveBeenCalledWith({ silhouetteScale: 0.8 });
  });

  it('calls onChange with multiSize: true when checkbox is checked', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={1} renderMode="halftone" filter="color" onChange={onChange} />,
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ multiSize: true });
  });

  it('calls onChange with multiSize: false when checkbox is unchecked', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={true} silhouetteScale={1} renderMode="halftone" filter="color" onChange={onChange} />,
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ multiSize: false });
  });

  it('emits renderMode: "composite" when the Composite radio is selected', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={1} renderMode="halftone" filter="color" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Composite/i }));
    expect(onChange).toHaveBeenCalledWith({ renderMode: 'composite' });
  });

  it('emits renderMode: "halftone" when the Halftone radio is selected', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={1} renderMode="composite" filter="color" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Halftone/i }));
    expect(onChange).toHaveBeenCalledWith({ renderMode: 'halftone' });
  });

  it('emits filter: "mono" when the Mono radio is selected', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={1} renderMode="composite" filter="color" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /^Mono$/i }));
    expect(onChange).toHaveBeenCalledWith({ filter: 'mono' });
  });

  it('emits filter: "color" when the Color radio is selected', () => {
    const onChange = vi.fn();
    render(
      <AdvancedOptions multiSize={false} silhouetteScale={1} renderMode="composite" filter="mono" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /^Color$/i }));
    expect(onChange).toHaveBeenCalledWith({ filter: 'color' });
  });
});
