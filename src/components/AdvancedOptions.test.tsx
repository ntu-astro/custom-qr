/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedOptions } from './AdvancedOptions';

describe('AdvancedOptions', () => {
  it('renders the silhouette scale as a percentage', () => {
    render(<AdvancedOptions multiSize={false} silhouetteScale={0.7} onChange={vi.fn()} />);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('calls onChange with silhouetteScale fraction when slider changes', () => {
    const onChange = vi.fn();
    render(<AdvancedOptions multiSize={false} silhouetteScale={0.7} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '80' } });
    expect(onChange).toHaveBeenCalledWith({ silhouetteScale: 0.8 });
  });

  it('calls onChange with multiSize: true when checkbox is checked', () => {
    const onChange = vi.fn();
    render(<AdvancedOptions multiSize={false} silhouetteScale={1} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ multiSize: true });
  });

  it('calls onChange with multiSize: false when checkbox is unchecked', () => {
    const onChange = vi.fn();
    render(<AdvancedOptions multiSize={true} silhouetteScale={1} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ multiSize: false });
  });
});
