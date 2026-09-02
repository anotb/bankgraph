import type { WorkspaceMetric } from '$lib/components/workspace/workspace-data';

export interface IndustrySnapshot {
	repdte: string;
	metrics: Record<string, number>;
}

export interface BreadthSnapshot {
	matchedBanks: number;
	loanGrowthBanks: number;
	depositGrowthBanks: number;
	roaImprovementBanks: number;
}

export interface BriefLine {
	label: string;
	text: string;
	metrics: WorkspaceMetric[];
}

function finite(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function formatQuarter(repdte: string | null | undefined): string {
	if (!repdte || !/^\d{8}$/.test(repdte)) return 'Reporting period unavailable';
	const month = Number(repdte.slice(4, 6));
	if (month < 1 || month > 12) return repdte;
	return `Q${Math.ceil(month / 3)} ${repdte.slice(0, 4)}`;
}

export function percentChange(current: number | null | undefined, prior: number | null | undefined): number | null {
	if (!finite(current) || !finite(prior) || prior === 0) return null;
	return ((current - prior) / Math.abs(prior)) * 100;
}

export function basisPointChange(current: number | null | undefined, prior: number | null | undefined): number | null {
	if (!finite(current) || !finite(prior)) return null;
	return Math.round((current - prior) * 100);
}

function movement(value: number, positive: string, negative: string): string {
	return value >= 0 ? positive : negative;
}

function signed(value: number, digits = 1): string {
	return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function bps(value: number): string {
	return `${value > 0 ? '+' : ''}${Math.round(value)} bp`;
}

function share(part: number, whole: number): string {
	return `${Math.round((part / whole) * 100)}%`;
}

/**
 * Produces a small, deterministic system brief. Every sentence is derived from
 * supplied observations; missing comparisons are omitted rather than inferred.
 */
export function buildSystemBrief(
	current: IndustrySnapshot | null,
	previous: IndustrySnapshot | null,
	yearAgo: IndustrySnapshot | null,
	breadth: BreadthSnapshot | null
): BriefLine[] {
	if (!current) return [];
	const lines: BriefLine[] = [];

	const assetQoq = percentChange(current.metrics.total_assets, previous?.metrics.total_assets);
	const depositQoq = percentChange(current.metrics.total_deposits, previous?.metrics.total_deposits);
	const assetYoy = percentChange(current.metrics.total_assets, yearAgo?.metrics.total_assets);
	const balanceParts: string[] = [];
	if (assetQoq !== null) {
		balanceParts.push(`Assets ${movement(assetQoq, 'rose', 'fell')} ${Math.abs(assetQoq).toFixed(1)}% from the previous quarter`);
	}
	if (depositQoq !== null) {
		balanceParts.push(`deposits ${movement(depositQoq, 'rose', 'fell')} ${Math.abs(depositQoq).toFixed(1)}%`);
	}
	if (assetYoy !== null) balanceParts.push(`assets were ${signed(assetYoy)} from a year earlier`);
	if (balanceParts.length > 0) {
		lines.push({ label: 'Balance sheet', text: `${balanceParts.join('; ')}.`, metrics: ['asset', 'dep'] });
	}

	const roa = basisPointChange(current.metrics.median_roa, previous?.metrics.median_roa);
	const nim = basisPointChange(current.metrics.median_nim, previous?.metrics.median_nim);
	const npl = basisPointChange(current.metrics.median_npl, previous?.metrics.median_npl);
	const earningsParts: string[] = [];
	if (roa !== null) earningsParts.push(`median ROA moved ${bps(roa)}`);
	if (nim !== null) earningsParts.push(`median net interest margin moved ${bps(nim)}`);
	if (npl !== null) earningsParts.push(`median noncurrent loan ratio moved ${bps(npl)}`);
	if (earningsParts.length > 0) {
		lines.push({ label: 'Earnings and credit', text: `${earningsParts.join('; ')}.`, metrics: ['roa', 'nimy', 'nclnlsr'] });
	}

	if (breadth && breadth.matchedBanks > 0) {
		lines.push({
			label: 'Breadth',
			text: `Among ${breadth.matchedBanks.toLocaleString('en-US')} active banks with consecutive filings, ${share(breadth.loanGrowthBanks, breadth.matchedBanks)} increased net loans, ${share(breadth.depositGrowthBanks, breadth.matchedBanks)} increased deposits, and ${share(breadth.roaImprovementBanks, breadth.matchedBanks)} improved ROA.`,
			metrics: ['dep', 'roa']
		});
	}

	return lines;
}
