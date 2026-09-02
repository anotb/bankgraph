import { describe, expect, it } from 'vitest';
import { basisPointChange, buildSystemBrief, formatQuarter, percentChange } from './home-brief';

describe('home system brief', () => {
	it('labels reporting quarters without a hardcoded date', () => {
		expect(formatQuarter('20250930')).toBe('Q3 2025');
		expect(formatQuarter(null)).toBe('Reporting period unavailable');
	});

	it('calculates comparable changes and rejects missing denominators', () => {
		expect(percentChange(110, 100)).toBe(10);
		expect(percentChange(110, 0)).toBeNull();
		expect(basisPointChange(1.04, 0.98)).toBe(6);
	});

	it('builds only evidence-backed lines', () => {
		const lines = buildSystemBrief(
			{ repdte: '20250930', metrics: { total_assets: 110, total_deposits: 96, median_roa: 1.04, median_nim: 3.1 } },
			{ repdte: '20250630', metrics: { total_assets: 100, total_deposits: 100, median_roa: 0.98, median_nim: 3.12 } },
			{ repdte: '20240930', metrics: { total_assets: 105, total_deposits: 91, median_roa: 0.95, median_nim: 3.2 } },
			{ matchedBanks: 100, loanGrowthBanks: 62, depositGrowthBanks: 48, roaImprovementBanks: 55 }
		);
		expect(lines).toHaveLength(3);
		expect(lines[0].text).toContain('Assets rose 10.0%');
		expect(lines[1].text).toContain('median ROA moved +6 bp');
		expect(lines[2].text).toContain('62% increased net loans');
	});

	it('does not manufacture a brief when no current observation exists', () => {
		expect(buildSystemBrief(null, null, null, null)).toEqual([]);
	});
});
