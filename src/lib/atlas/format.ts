/** Formatting helpers shared by the Atlas surfaces. FDIC money fields are USD thousands. */

export function quarterLabel(repdte: string | null | undefined, style: 'short' | 'long' = 'short'): string {
	if (!repdte || repdte.length < 6) return '—';
	const year = repdte.slice(0, 4);
	const q = Math.ceil(Number(repdte.slice(4, 6)) / 3);
	return style === 'short' ? `Q${q} ʼ${year.slice(2)}` : `Q${q} ${year}`;
}

export function usdThousands(value: number | null | undefined, digits = 1): string {
	if (value == null || !Number.isFinite(value)) return '—';
	const dollars = value * 1000;
	const abs = Math.abs(dollars);
	const sign = dollars < 0 ? '−' : '';
	if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(digits)}T`;
	if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
	if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
	return `${sign}$${abs.toFixed(0)}`;
}

export function pct(value: number | null | undefined, digits = 2): string {
	if (value == null || !Number.isFinite(value)) return '—';
	return `${value.toFixed(digits)}%`;
}

export function signed(value: number | null | undefined, digits = 2, unit = ''): string {
	if (value == null || !Number.isFinite(value)) return '—';
	const sign = value > 0 ? '+' : value < 0 ? '−' : '';
	return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

/** Change between two values in the metric's natural unit: pp for ratios, % for balances, bp when small. */
export function changeLabel(current: number | null, prior: number | null, unit: 'percent' | 'usd_thousands' | 'count'): { text: string; direction: 'up' | 'down' | 'flat' | 'none' } {
	if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior)) return { text: '—', direction: 'none' };
	if (unit === 'percent') {
		const pp = current - prior;
		const bp = Math.round(pp * 100);
		const text = Math.abs(bp) < 100 ? `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp)} bp` : `${signed(pp, 2)} pp`;
		return { text, direction: bp > 0 ? 'up' : bp < 0 ? 'down' : 'flat' };
	}
	if (prior === 0) return { text: '—', direction: 'none' };
	const change = ((current - prior) / Math.abs(prior)) * 100;
	return { text: `${signed(change, 1)}%`, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat' };
}

export function count(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return '—';
	return Math.round(value).toLocaleString('en-US');
}

export function shortBankName(name: string): string {
	return name
		.replace(/,?\s+National Association$/i, '')
		.replace(/,?\s+N\.?A\.?$/i, '')
		.replace(/\s+Federal Savings Bank$/i, ' FSB')
		.replace(/\s+Bank and Trust Company$/i, ' Bank & Trust')
		.trim();
}

/** A label short enough to sit beside a line or dot: "JPMorgan Chase", "Bank of America", "Wells Fargo". */
export function tinyBankName(name: string): string {
	const words = shortBankName(name).split(/\s+/);
	const take = /^(bank|first|the|new|old|state|united|farmers|peoples|citizens)$/i.test(words[0] ?? '') && words.length >= 3 ? 3 : 2;
	return words.slice(0, take).join(' ').replace(/,$/, '');
}

export const SERIES_COLORS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'] as const;
export function seriesColor(index: number): string {
	return `var(${SERIES_COLORS[index % SERIES_COLORS.length]})`;
}
