import { describe, it, expect } from 'vitest';
import { generateNarrative, type NarrativeInput } from './narrative';

function base(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    latestQuarter: '20251231',
    metrics: { median_roa: 1.1, median_roe: 12.0, median_nim: 3.72 },
    rateDeltasBps: { median_roa: -8, median_roe: -56, median_nim: 5 },
    assetsDeltaPct: 0.67,
    depositsDeltaPct: 1.83,
    recent5yrFailures: 10,
    topMover: null,
    ...overrides
  };
}

describe('generateNarrative', () => {
  it('leads with the largest absolute basis-point move', () => {
    const out = generateNarrative(base());
    // ROE moved -56bps, the largest magnitude among the three
    expect(out[0]).toContain('Median ROE');
    expect(out[0]).toContain('(-56bps)');
    expect(out[0]).toContain('fell');
  });

  it('renders a positive move with a + sign and "rose"', () => {
    const out = generateNarrative(
      base({ rateDeltasBps: { median_roa: 3, median_roe: 2, median_nim: 1 } })
    );
    expect(out[0]).toContain('Median ROA');
    expect(out[0]).toContain('(+3bps)');
    expect(out[0]).toContain('rose');
  });

  it('uses "held at" for a zero move and omits the bps parenthetical', () => {
    const out = generateNarrative(
      base({ rateDeltasBps: { median_roa: 0, median_roe: 0, median_nim: 0 } })
    );
    expect(out[0]).toContain('held at');
    expect(out[0]).not.toContain('bps');
  });

  it('does not editorialize: no "sharply" even on large moves', () => {
    const out = generateNarrative(
      base({ rateDeltasBps: { median_roa: 120, median_roe: 5, median_nim: 5 } })
    );
    expect(out[0]).toContain('notably');
    expect(out[0]).not.toContain('sharply');
  });

  it('summarizes assets and deposits as relative percentages', () => {
    const out = generateNarrative(base());
    const line = out.find((s) => s.includes('quarter-on-quarter'));
    expect(line).toBeDefined();
    expect(line).toContain('assets grew 0.67%');
    expect(line).toContain('deposits grew 1.83%');
  });

  it('prefers a named top mover over the failures coda', () => {
    const out = generateNarrative(
      base({
        topMover: { cert: 1, name: 'Example Bank', metric: 'roa', current: 2.5, delta_bps: 180 }
      })
    );
    const mover = out.find((s) => s.startsWith('Notable mover:'));
    expect(mover).toBeDefined();
    expect(mover).toContain('Example Bank climbed 180bps');
    expect(out.some((s) => s.includes('failures recorded'))).toBe(false);
  });

  it('falls back to the failures coda when there is no top mover', () => {
    const out = generateNarrative(base({ topMover: null, recent5yrFailures: 3 }));
    expect(out.some((s) => s === '3 failures recorded over the past five years.')).toBe(true);
  });

  it('does not use absolutist or salesy words', () => {
    const out = generateNarrative(base()).join(' ').toLowerCase();
    for (const banned of ['every', 'comprehensive', 'powerful', 'seamless', 'live financial']) {
      expect(out).not.toContain(banned);
    }
  });

  it('handles a missing quarter gracefully', () => {
    const out = generateNarrative(base({ latestQuarter: null }));
    expect(out[0]).toContain('the latest quarter');
  });

  it('emits a snapshot line when no rate deltas are available', () => {
    const out = generateNarrative(
      base({
        rateDeltasBps: { median_roa: null, median_roe: null, median_nim: null },
        assetsDeltaPct: null,
        depositsDeltaPct: null,
        topMover: null,
        recent5yrFailures: 0
      })
    );
    expect(out[0]).toBe('Industry snapshot for Q4 2025.');
  });
});
