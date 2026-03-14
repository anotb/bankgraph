/**
 * Formatting utilities for bank data display.
 * Asset/deposit values from FDIC are reported in thousands.
 */

/** Format a value (in thousands) to human-readable currency: $1.2T, $450B, $12M, $1.2K */
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—';

  // Convert from thousands to actual dollars
  const dollars = value * 1000;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : '';

  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Format a number as a percentage string */
export function formatPercent(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

/** Format a date string to "Mar 2024". Accepts YYYYMMDD, YYYY-MM-DD, or MM/DD/YYYY formats. */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  let year: string;
  let monthIdx: number;

  if (dateStr.includes('/')) {
    // MM/DD/YYYY format (from FDIC API)
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    monthIdx = parseInt(parts[0], 10) - 1;
    year = parts[2];
  } else if (dateStr.includes('-')) {
    // YYYY-MM-DD format (ISO)
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    year = parts[0];
    monthIdx = parseInt(parts[1], 10) - 1;
  } else {
    // YYYYMMDD format
    year = dateStr.slice(0, 4);
    monthIdx = parseInt(dateStr.slice(4, 6), 10) - 1;
  }

  if (monthIdx < 0 || monthIdx > 11 || !year || year.length < 4) return dateStr;

  return `${months[monthIdx]} ${year}`;
}

/** Format a number with commas */
export function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US');
}

/**
 * Derive semantic status for a bank metric based on regulatory health thresholds.
 *
 * Thresholds:
 *   ROA:         > 1.0% good, 0.5-1.0% warning, < 0.5% danger
 *   ROE:         > 10%  good, 5-10%    warning, < 5%   danger
 *   NIM:         > 3.0% good, 2.0-3.0% warning, < 2.0% danger
 *   NPL Ratio:   < 1.0% good, 1.0-3.0% warning, > 3.0% danger (inverted)
 *   Tier 1 Cap:  > 10%  good, 8-10%    warning, < 8%   danger
 */
export function getMetricStatus(
  metric: string,
  value: number | null
): 'positive' | 'warning' | 'negative' | undefined {
  if (value === null || value === undefined) return undefined;

  const thresholds: Record<string, { good: number; warn: number; inverse?: boolean }> = {
    roa: { good: 1.0, warn: 0.5 },
    roe: { good: 10, warn: 5 },
    nim: { good: 3.0, warn: 2.0 },
    npl_ratio: { good: 1.0, warn: 3.0, inverse: true },
    tier1_ratio: { good: 10, warn: 8 }
  };

  const t = thresholds[metric];
  if (!t) return undefined;

  if (t.inverse) {
    if (value < t.good) return 'positive';
    if (value > t.warn) return 'negative';
    return 'warning';
  }

  if (value >= t.good) return 'positive';
  if (value >= t.warn) return 'warning';
  return 'negative';
}

/** Map a semantic status to a Tailwind text-color class */
export function semanticColor(semantic: string | undefined): string {
  if (semantic === 'positive') return 'text-[--positive]';
  if (semantic === 'negative') return 'text-[--negative]';
  if (semantic === 'warning') return 'text-[--warning]';
  return 'text-[--text-primary]';
}
