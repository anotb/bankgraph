/**
 * Robust statistics for Risk Score v2.
 *
 * Pure functions, no dependencies, no I/O. Everything here is unit-testable
 * without a database.
 *
 * Methodology notes (documented per spec):
 * - Location/scale: median and MAD (median absolute deviation). MAD * 1.4826
 *   estimates the standard deviation for normal data while being resistant to
 *   outliers — a single extreme bank cannot inflate the scale the way a mean
 *   or standard deviation can (which is exactly what happened pre-2008 when
 *   outlier banks dragged peer means and masked their own risk).
 * - Winsorization: robust z-scores are clamped to [-5, +5]. This bounds each
 *   metric's contribution to the composite so one pathological ratio cannot
 *   dominate.
 * - Zero-inflated ratios: when MAD = 0 (e.g. >50% of peers report exactly 0
 *   brokered deposits), there is no usable scale. Fallback order:
 *     1. std-dev of the band (if > 0)
 *     2. pooled MAD/std-dev of the nearest band (by band index distance)
 *     3. neutral score (z = 0) if no scale can be found anywhere
 *   Documented choice: we prefer std-dev over dropping the metric because a
 *   zero-MAD ratio still carries signal (a bank with 40% brokered deposits
 *   should not score the same as one with 0%).
 */

/** Size bands by total assets (in thousands, as FDIC reports). */
export const SIZE_BANDS = [
  { id: 1, key: 'lt1b', label: '< $1B', min: 0, max: 1_000_000 },
  { id: 2, key: 'b1to10b', label: '$1B – $10B', min: 1_000_000, max: 10_000_000 },
  { id: 3, key: 'gt10b', label: '> $10B', min: 10_000_000, max: Infinity }
] as const;

export type SizeBandId = 1 | 2 | 3;

/** Resolve a size band id from total assets (thousands). Returns null when assets are unknown. */
export function bandForAssets(assets: number | null | undefined): SizeBandId | null {
  if (assets == null || !isFinite(assets) || assets <= 0) return null;
  for (const band of SIZE_BANDS) {
    if (assets >= band.min && assets < band.max) return band.id as SizeBandId;
  }
  return 3;
}

/** Median of an array. Does not mutate the input. Returns null for empty input. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation: median of |x - median(x)|.
 * Returns null for empty input, 0 when the majority of values are identical.
 */
export function mad(values: number[]): number | null {
  if (values.length === 0) return null;
  const med = median(values);
  if (med === null) return null;
  return median(values.map((v) => Math.abs(v - med)));
}

/** Sample standard deviation. Returns 0 for n < 2. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const ss = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

/** Clamp a value into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Winsorization bound for robust z-scores (per spec: ±5). */
export const ZSCORE_LIMIT = 5;

/** Scale factor making MAD a consistent estimator of std-dev under normality. */
export const MAD_TO_STD = 1.4826;

/**
 * Per-band distribution stats for one metric.
 * `scale` is the denominator used for robust z-scores: MAD * 1.4826 when
 * usable, else the band std-dev, else the nearest band's usable scale.
 */
export interface BandStats {
  band: SizeBandId;
  count: number;
  median: number | null;
  mad: number | null;
  /** Effective scale for z-scores; null only when no usable scale exists anywhere. */
  scale: number | null;
  /** Which fallback produced `scale`: 'mad' | 'stdev' | 'nearest_mad' | 'nearest_stdev' | null */
  scaleSource: 'mad' | 'stdev' | 'nearest_mad' | 'nearest_stdev' | null;
}

/**
 * Compute band stats for one metric across all three bands.
 * Values are grouped by band before calling this; `byBand` maps band id to values.
 */
export function computeBandStats(byBand: Record<number, number[]>): Record<number, BandStats> {
  const raw = new Map<number, { median: number | null; mad: number | null; stdev: number }>();
  for (const band of SIZE_BANDS) {
    const values = byBand[band.id] ?? [];
    raw.set(band.id, { median: median(values), mad: mad(values), stdev: stdev(values) });
  }

  const result: Record<number, BandStats> = {};
  for (const band of SIZE_BANDS) {
    const r = raw.get(band.id)!;
    let scale: number | null = null;
    let scaleSource: BandStats['scaleSource'] = null;

    const madScale = r.mad != null ? r.mad * MAD_TO_STD : null;
    if (madScale != null && madScale > 0) {
      scale = madScale;
      scaleSource = 'mad';
    } else if (r.stdev > 0) {
      scale = r.stdev;
      scaleSource = 'stdev';
    }

    result[band.id] = {
      band: band.id,
      count: (byBand[band.id] ?? []).length,
      median: r.median,
      mad: r.mad,
      scale,
      scaleSource
    };
  }

  // Zero-inflated fallback: borrow scale from the nearest band that has one.
  for (const band of SIZE_BANDS) {
    const stats = result[band.id];
    if (stats.scale != null) continue;

    // Search outward: adjacent band, then the remaining band.
    const candidates = ([-1, 1, -2, 2] as const)
      .map((d) => ({ d, id: band.id + d }) as const)
      .filter((c) => c.id >= 1 && c.id <= 3);

    for (const c of candidates) {
      const other = result[c.id];
      if (!other || other.scale == null) continue;
      stats.scale = other.scale;
      stats.scaleSource =
        other.scaleSource === 'mad'
          ? 'nearest_mad'
          : other.scaleSource === 'stdev'
            ? 'nearest_stdev'
            : null;
      if (stats.scaleSource) break;
    }
  }

  return result;
}

/**
 * Robust z-score: (x - median) / scale, winsorized to ±ZSCORE_LIMIT.
 * Returns 0 (neutral) when scale is null/0 or x is non-finite — a bank with
 * unknown data should sit at the peer median, not at an extreme.
 */
export function robustZ(value: number | null | undefined, stats: BandStats | undefined): number {
  if (value == null || !isFinite(value)) return 0;
  if (!stats || stats.median == null || stats.scale == null || stats.scale <= 0) return 0;
  return clamp((value - stats.median) / stats.scale, -ZSCORE_LIMIT, ZSCORE_LIMIT);
}

/**
 * Map a winsorized z-score to a 0-100 subscore where 50 = peer median.
 * Linear in z: z = +5 (worst) -> 0, z = 0 -> 50, z = -5 (best) -> 100.
 */
export function zToSubscore(z: number): number {
  return clamp(50 - (z / ZSCORE_LIMIT) * 50, 0, 100);
}
