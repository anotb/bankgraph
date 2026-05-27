/**
 * Programmatic narrative summary for the homepage hero.
 *
 * Picks the most "interesting" facts from the latest quarter and composes
 * a short, factual lede. No AI involved — just template logic over real numbers.
 *
 * Style: 1-3 short factual fragments. No filler. Reads like a Bloomberg
 * morning brief, not a marketing blurb.
 */

import { formatPercent } from './formatters.js';

/** Current median values for the rate metrics (in percent, e.g. 1.18 = 1.18%). */
export interface NarrativeMetrics {
  median_roa: number | null;
  median_roe: number | null;
  median_nim: number | null;
}

/** Absolute QoQ change for each rate metric, in basis points (curr − prev) × 100. */
export interface NarrativeRateDeltasBps {
  median_roa: number | null;
  median_roe: number | null;
  median_nim: number | null;
}

export interface NarrativeMover {
  cert: number;
  name: string;
  metric: 'roa' | 'roe' | 'nim';
  current: number;
  delta_bps: number;
}

export interface NarrativeInput {
  latestQuarter: string | null;
  metrics: NarrativeMetrics;
  /** Basis-point changes, computed once on the server — same source as the displayed deltas. */
  rateDeltasBps: NarrativeRateDeltasBps;
  /** Relative QoQ change for the dollar aggregates, in percent. */
  assetsDeltaPct: number | null;
  depositsDeltaPct: number | null;
  recent5yrFailures: number;
  topMover: NarrativeMover | null;
}

function directionWord(delta: number): string {
  if (delta > 0) return 'rose';
  if (delta < 0) return 'fell';
  return 'held';
}

/** Understated magnitude word — avoids editorializing on small moves. */
function magnitudeWord(absBps: number): string {
  if (absBps >= 25) return 'notably';
  if (absBps >= 8) return 'modestly';
  return 'slightly';
}

function quarterLabel(yyyymmdd: string | null): string {
  if (!yyyymmdd || yyyymmdd.length < 6) return 'the latest quarter';
  const y = yyyymmdd.slice(0, 4);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const q = Math.ceil(m / 3);
  return `Q${q} ${y}`;
}

/**
 * Generate 1-3 short narrative fragments describing the current state of the industry.
 * Returns an ordered list of sentences; the caller decides how many to render.
 */
export function generateNarrative(input: NarrativeInput): string[] {
  const sentences: string[] = [];
  const qLabel = quarterLabel(input.latestQuarter);

  // Lede: lead with the biggest absolute (basis-point) move among ROA/ROE/NIM.
  const moves: Array<{ key: 'ROA' | 'ROE' | 'NIM'; bps: number; current: number }> = [];
  if (input.rateDeltasBps.median_roa != null && input.metrics.median_roa != null)
    moves.push({ key: 'ROA', bps: input.rateDeltasBps.median_roa, current: input.metrics.median_roa });
  if (input.rateDeltasBps.median_roe != null && input.metrics.median_roe != null)
    moves.push({ key: 'ROE', bps: input.rateDeltasBps.median_roe, current: input.metrics.median_roe });
  if (input.rateDeltasBps.median_nim != null && input.metrics.median_nim != null)
    moves.push({ key: 'NIM', bps: input.rateDeltasBps.median_nim, current: input.metrics.median_nim });

  moves.sort((a, b) => Math.abs(b.bps) - Math.abs(a.bps));
  const headline = moves[0];

  if (headline) {
    if (headline.bps === 0) {
      sentences.push(`Median ${headline.key} held at ${formatPercent(headline.current)} in ${qLabel}.`);
    } else {
      const dir = directionWord(headline.bps);
      const mag = magnitudeWord(Math.abs(headline.bps));
      const sign = headline.bps > 0 ? '+' : '';
      sentences.push(
        `Median ${headline.key} ${dir} ${mag} (${sign}${headline.bps}bps) to ${formatPercent(headline.current)} in ${qLabel}.`
      );
    }
  } else {
    sentences.push(`Industry snapshot for ${qLabel}.`);
  }

  // Sidekick: assets / deposits growth
  const assetsDelta = input.assetsDeltaPct;
  const depositsDelta = input.depositsDeltaPct;
  if (assetsDelta != null || depositsDelta != null) {
    const parts: string[] = [];
    if (assetsDelta != null) {
      const dir = assetsDelta > 0 ? 'grew' : assetsDelta < 0 ? 'contracted' : 'held flat';
      const pct = Math.abs(assetsDelta).toFixed(2);
      parts.push(`assets ${dir}${assetsDelta !== 0 ? ` ${pct}%` : ''}`);
    }
    if (depositsDelta != null) {
      const dir = depositsDelta > 0 ? 'grew' : depositsDelta < 0 ? 'contracted' : 'held flat';
      const pct = Math.abs(depositsDelta).toFixed(2);
      parts.push(`deposits ${dir}${depositsDelta !== 0 ? ` ${pct}%` : ''}`);
    }
    if (parts.length) {
      sentences.push(`Industry ${parts.join(', ')} quarter-on-quarter.`);
    }
  }

  // Risk coda: prefer concrete top-mover with name; otherwise fall back to failures.
  // "climbed"/"dropped" already carries direction, so render the magnitude unsigned.
  if (input.topMover) {
    const dir = input.topMover.delta_bps > 0 ? 'climbed' : 'dropped';
    sentences.push(
      `Notable mover: ${input.topMover.name} ${dir} ${Math.abs(input.topMover.delta_bps)}bps to ${formatPercent(input.topMover.current)} ROA.`
    );
  } else if (input.recent5yrFailures > 0) {
    sentences.push(`${input.recent5yrFailures} ${input.recent5yrFailures === 1 ? 'failure' : 'failures'} recorded over the past five years.`);
  }

  return sentences;
}
