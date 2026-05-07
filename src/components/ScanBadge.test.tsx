/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ScanResult } from '../types';
import { ScanBadge } from './ScanBadge';

// SCREEN_SIZE_THRESHOLD = 320 — sizes >= 320 are "screen", < 320 are "print"
const screenOk: ScanResult = { size: 1080, ok: true };
const screenFail: ScanResult = { size: 1080, ok: false };
const printOk: ScanResult = { size: 200, ok: true };
const printFail: ScanResult = { size: 200, ok: false };

describe('ScanBadge — multi-size off', () => {
  it('renders "Scannable" text when screen result is ok', () => {
    render(<ScanBadge results={[screenOk]} multiSize={false} />);
    expect(screen.getByText(/Scannable/)).toBeInTheDocument();
  });

  it('does not render a print badge when multi-size is off', () => {
    render(<ScanBadge results={[screenOk, printOk]} multiSize={false} />);
    expect(screen.queryByText(/print size/i)).not.toBeInTheDocument();
  });

  it('renders the warning when screen result is not ok', () => {
    render(<ScanBadge results={[screenFail]} multiSize={false} />);
    expect(screen.getByText(/May not scan reliably/)).toBeInTheDocument();
  });
});

describe('ScanBadge — multi-size on', () => {
  it('shows both green badges when screen and print both pass', () => {
    render(<ScanBadge results={[screenOk, printOk]} multiSize={true} />);
    expect(screen.getByText(/Scannable on screen/)).toBeInTheDocument();
    expect(screen.getByText(/Scannable when printed small/)).toBeInTheDocument();
  });

  it('shows screen badge ok and print failure badge when print result is missing', () => {
    render(<ScanBadge results={[screenOk]} multiSize={true} />);
    expect(screen.getByText(/Scannable on screen/)).toBeInTheDocument();
    expect(screen.getByText(/Won't scan at print size/i)).toBeInTheDocument();
  });

  it('shows screen badge ok and print failure badge when print result is false', () => {
    render(<ScanBadge results={[screenOk, printFail]} multiSize={true} />);
    expect(screen.getByText(/Scannable on screen/)).toBeInTheDocument();
    expect(screen.getByText(/Won't scan at print size/i)).toBeInTheDocument();
  });
});
