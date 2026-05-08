import { describe, it, expect } from 'vitest';
import {
  decodeFailureProb,
  shouldAcceptFlip,
  buildFinderDistanceMap,
  type FlipBudgetPolicy,
  type ArtUpCoefficients,
  type BlockFlipState,
} from './flipBudget';
import { buildSamplingContext } from './samplingSim';
import { buildPredictedCanvas } from './predictedCanvas';
import { buildMatrix } from './qrMatrix';

const ZERO_COEFFS: ArtUpCoefficients = {
  intercept: 0,
  surroundContrast: 0,
  centreCorrelation: 0,
  finderDistance: 0,
};

const SHARP_COEFFS: ArtUpCoefficients = {
  intercept: -2,
  surroundContrast: 4,
  centreCorrelation: -1,
  finderDistance: 0.1,
};

describe('decodeFailureProb', () => {
  it('returns 0.5 at z=0 (intercept 0, all features 0)', () => {
    const p = decodeFailureProb(
      { surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
      ZERO_COEFFS,
    );
    expect(p).toBeCloseTo(0.5, 5);
  });

  it('approaches 0 for large negative z', () => {
    const p = decodeFailureProb(
      { surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
      { intercept: -10, surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
    );
    expect(p).toBeLessThan(0.001);
  });

  it('approaches 1 for large positive z', () => {
    const p = decodeFailureProb(
      { surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
      { intercept: 10, surroundContrast: 0, centreCorrelation: 0, finderDistance: 0 },
    );
    expect(p).toBeGreaterThan(0.999);
  });
});

function blackImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function makeCtx() {
  const matrix = buildMatrix('https://www.instagram.com/ntu_astro/');
  const source = blackImageData(64, 64);
  const predicted = buildPredictedCanvas(source, matrix, 0, 1, 'halftone', 'mono');
  return buildSamplingContext(predicted, matrix);
}

describe('shouldAcceptFlip — fixed policy', () => {
  it('accepts up to floor(ratio × ecCount), rejects beyond', () => {
    const policy: FlipBudgetPolicy = { kind: 'fixed', ratio: 0.15 };
    const ctx = makeCtx();
    const ecCount = 28;
    const cap = Math.floor(0.15 * ecCount);
    const candidate = { modules: [{ x: 10, y: 10 }] };

    for (let i = 0; i < cap; i++) {
      const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: i, ecCount };
      const { accepted } = shouldAcceptFlip(policy, state, candidate, ctx, ZERO_COEFFS, null);
      expect(accepted).toBe(true);
    }
    const overState: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: cap, ecCount };
    const { accepted } = shouldAcceptFlip(policy, overState, candidate, ctx, ZERO_COEFFS, null);
    expect(accepted).toBe(false);
  });

  it('returns pNew = 0 under fixed policy (unused)', () => {
    const policy: FlipBudgetPolicy = { kind: 'fixed', ratio: 0.5 };
    const ctx = makeCtx();
    const candidate = { modules: [{ x: 10, y: 10 }] };
    const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: 0, ecCount: 28 };
    const { pNew } = shouldAcceptFlip(policy, state, candidate, ctx, SHARP_COEFFS, null);
    expect(pNew).toBe(0);
  });
});

describe('shouldAcceptFlip — probabilistic policy', () => {
  it('failureTolerance: 0 → never accepts', () => {
    const policy: FlipBudgetPolicy = { kind: 'probabilistic', failureTolerance: 0 };
    const ctx = makeCtx();
    const candidate = { modules: [{ x: 10, y: 10 }] };
    const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: 0, ecCount: 28 };
    const { accepted } = shouldAcceptFlip(policy, state, candidate, ctx, SHARP_COEFFS, null);
    expect(accepted).toBe(false);
  });

  it('failureTolerance ≈ 1 → always accepts (until hard cap)', () => {
    const policy: FlipBudgetPolicy = { kind: 'probabilistic', failureTolerance: 1.0 };
    const ctx = makeCtx();
    const candidate = { modules: [{ x: 10, y: 10 }] };
    const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: 0, ecCount: 28 };
    const { accepted } = shouldAcceptFlip(policy, state, candidate, ctx, SHARP_COEFFS, null);
    expect(accepted).toBe(true);
  });

  it('hard cap: rejects once flipsAccepted >= floor(ecCount/2)', () => {
    const policy: FlipBudgetPolicy = { kind: 'probabilistic', failureTolerance: 1.0 };
    const ctx = makeCtx();
    const candidate = { modules: [{ x: 10, y: 10 }] };
    const ecCount = 28;
    const cap = Math.floor(ecCount / 2);
    const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: cap, ecCount };
    const { accepted } = shouldAcceptFlip(policy, state, candidate, ctx, ZERO_COEFFS, null);
    expect(accepted).toBe(false);
  });

  it('monotonicity: accepted flips reduce survival → eventually rejects', () => {
    const policy: FlipBudgetPolicy = { kind: 'probabilistic', failureTolerance: 0.05 };
    const ctx = makeCtx();
    const candidate = { modules: [{ x: 10, y: 10 }] };
    // Use SHARP_COEFFS so each flip has a non-trivial pNew.
    const state: BlockFlipState = { cumulativeSurvivalProb: 1, flipsAccepted: 0, ecCount: 28 };
    let acceptedCount = 0;
    for (let i = 0; i < 50; i++) {
      const r = shouldAcceptFlip(policy, state, candidate, ctx, SHARP_COEFFS, null);
      if (!r.accepted) break;
      state.flipsAccepted++;
      state.cumulativeSurvivalProb *= 1 - r.pNew;
      acceptedCount++;
    }
    // Eventually some flip must be rejected — either by the cumulative-prob
    // gate or the hard cap.
    expect(acceptedCount).toBeLessThan(50);
  });
});

describe('buildFinderDistanceMap', () => {
  it('finder centres have distance 0 to themselves', () => {
    const size = 21; // V1
    const map = buildFinderDistanceMap(size);
    expect(map[3 * size + 3]).toBe(0);            // TL
    expect(map[3 * size + (size - 4)]).toBe(0);    // TR
    expect(map[(size - 4) * size + 3]).toBe(0);    // BL
  });

  it('centre of the matrix is far from finder corners', () => {
    const size = 73; // V13
    const map = buildFinderDistanceMap(size);
    const c = Math.floor(size / 2);
    const centreDist = map[c * size + c];
    expect(centreDist).toBeGreaterThan(20);
  });
});
