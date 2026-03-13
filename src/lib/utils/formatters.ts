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
