import { describe, it, expect } from 'vitest';
import {
	classifyPCA,
	screenCapitalRatios,
	computeCapitalScore,
	computeAssetQualityScore,
	computeEarningsScore,
	computeLiquidityScore,
	computeCompositeScore,
	computeEmpiricalPercentile
} from './risk-scores';

// --- PCA Classification ---

describe('classifyPCA', () => {
	it('leaves missing capital data unclassified', () => {
		expect(classifyPCA({ rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null })).toBe('unclassified');
		expect(classifyPCA({ rbcrwaj: 0, rbc1rwaj: 0, rbc1aaj: 0 })).toBe('unclassified');
	});

	it('classifies well-capitalized bank', () => {
		expect(classifyPCA({ rbcrwaj: 14, rbc1rwaj: 12, rbc1aaj: 8 })).toBe('well_capitalized');
	});

	it('classifies adequately capitalized (below well-cap but above minimums)', () => {
		// rbcrwaj < 10 but >= 8
		expect(classifyPCA({ rbcrwaj: 9, rbc1rwaj: 7, rbc1aaj: 4.5 })).toBe('adequately_capitalized');
	});

	it('classifies undercapitalized', () => {
		// rbcrwaj < 8 but >= 6
		expect(classifyPCA({ rbcrwaj: 7, rbc1rwaj: 5.5, rbc1aaj: 3.5 })).toBe('undercapitalized');
	});

	it('classifies significantly undercapitalized', () => {
		expect(classifyPCA({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 2.5 })).toBe('significantly_undercapitalized');
	});

	it('does not infer the official critical category from the Tier 1 leverage ratio', () => {
		expect(screenCapitalRatios({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 2 })).toBe('significantly_undercapitalized');
		expect(screenCapitalRatios({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 1 })).toBe('significantly_undercapitalized');
	});

	it('handles partial null data (uses available ratios)', () => {
		// Only rbcrwaj available and below well-cap
		expect(classifyPCA({ rbcrwaj: 9, rbc1rwaj: null, rbc1aaj: null })).toBe('adequately_capitalized');
	});

	it('handles single ratio triggering undercapitalized', () => {
		// rbcrwaj is fine but rbc1aaj is below 4
		expect(classifyPCA({ rbcrwaj: 12, rbc1rwaj: 10, rbc1aaj: 3.5 })).toBe('undercapitalized');
	});

	it('handles exactly-at-threshold values', () => {
		// Exactly at well-capitalized thresholds
		expect(classifyPCA({ rbcrwaj: 10, rbc1rwaj: 8, rbc1aaj: 5 })).toBe('well_capitalized');
	});

	it('treats zero capital ratios as unreported (not undercapitalized)', () => {
		// Many institutions report 0 for rbcrwaj when they use a different capital framework
		expect(classifyPCA({ rbcrwaj: 0, rbc1rwaj: null, rbc1aaj: 13 })).toBe('well_capitalized');
		expect(classifyPCA({ rbcrwaj: 0, rbc1rwaj: 0, rbc1aaj: 8 })).toBe('well_capitalized');
	});

	it('still flags truly low non-zero ratios', () => {
		// rbcrwaj = 0.5 is a real value < 6, triggers significantly_undercapitalized
		expect(classifyPCA({ rbcrwaj: 0.5, rbc1rwaj: null, rbc1aaj: 13 })).toBe('significantly_undercapitalized');
		// Only rbc1aaj is available and it's low
		expect(classifyPCA({ rbcrwaj: 0, rbc1rwaj: null, rbc1aaj: 1.5 })).toBe('significantly_undercapitalized');
	});
});

// --- Capital Score ---

describe('computeCapitalScore', () => {
	it('uses the materially-below-threshold score without inferring official critical status', () => {
		expect(computeCapitalScore({ rbcrwaj: 3, rbc1rwaj: 2, rbc1aaj: 1 })).toBe(15);
	});

	it('returns 15 for significantly undercapitalized', () => {
		expect(computeCapitalScore({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 2.5 })).toBe(15);
	});

	it('returns 30 for undercapitalized', () => {
		expect(computeCapitalScore({ rbcrwaj: 7, rbc1rwaj: 5, rbc1aaj: 3.5 })).toBe(30);
	});

	it('returns 40-60 for adequately capitalized', () => {
		const score = computeCapitalScore({ rbcrwaj: 9, rbc1rwaj: 7, rbc1aaj: 4.5 });
		expect(score).toBeGreaterThanOrEqual(40);
		expect(score).toBeLessThanOrEqual(60);
	});

	it('returns 60-100 for well-capitalized', () => {
		const score = computeCapitalScore({ rbcrwaj: 14, rbc1rwaj: 12, rbc1aaj: 8 });
		expect(score).toBeGreaterThanOrEqual(60);
		expect(score).toBeLessThanOrEqual(100);
	});

	it('caps at 100 for extremely well-capitalized banks', () => {
		const score = computeCapitalScore({ rbcrwaj: 30, rbc1rwaj: 25, rbc1aaj: 20 });
		expect(score).toBeLessThanOrEqual(100);
	});

	it('returns no score when capital inputs are missing', () => {
		expect(computeCapitalScore({ rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null })).toBeNull();
	});

	it('increases with buffer above thresholds', () => {
		const lowBuffer = computeCapitalScore({ rbcrwaj: 11, rbc1rwaj: 9, rbc1aaj: 6 });
		const highBuffer = computeCapitalScore({ rbcrwaj: 15, rbc1rwaj: 13, rbc1aaj: 10 });
		expect(highBuffer).not.toBeNull();
		expect(lowBuffer).not.toBeNull();
		expect(highBuffer!).toBeGreaterThan(lowBuffer!);
	});
});

describe('computeCompositeScore', () => {
	it('renormalizes remaining dimensions instead of treating missing capital as zero', () => {
		const score = computeCompositeScore({
			capital: null,
			assetQuality: 80,
			earnings: 60,
			liquidity: 40
		});

		expect(score).toBeCloseTo((80 * 0.25 + 60 * 0.25 + 40 * 0.20) / 0.70);
	});

	it('returns null when every dimension is unavailable', () => {
		expect(computeCompositeScore({
			capital: null,
			assetQuality: null,
			earnings: null,
			liquidity: null
		})).toBeNull();
	});

	it('suppresses the composite when fewer than three dimensions are available', () => {
		expect(computeCompositeScore({
			capital: 90,
			assetQuality: 70,
			earnings: null,
			liquidity: null
		})).toBeNull();
	});
});

// --- Asset Quality Score ---

describe('computeAssetQualityScore', () => {
	it('keeps a missing input unscored', () => {
		expect(computeAssetQualityScore(null)).toBeNull();
	});

	it('returns high score (75-100) for low NPL percentile (good)', () => {
		const score = computeAssetQualityScore(10);
		expect(score).toBeGreaterThanOrEqual(75);
		expect(score).toBeLessThanOrEqual(100);
	});

	it('returns low score (0-25) for high NPL percentile (bad)', () => {
		const score = computeAssetQualityScore(90);
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(25);
	});

	it('returns 50 for 50th percentile', () => {
		expect(computeAssetQualityScore(50)).toBe(50);
	});

	it('returns 0 for 100th percentile (worst NPL)', () => {
		expect(computeAssetQualityScore(100)).toBe(0);
	});

	it('returns 100 for 0th percentile (best NPL)', () => {
		expect(computeAssetQualityScore(0)).toBe(100);
	});

	it('is monotonically decreasing (higher NPL percentile = lower score)', () => {
		const scores = [0, 10, 25, 50, 75, 90, 100].map((value) => computeAssetQualityScore(value)!);
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
		}
	});
});

// --- Earnings Score ---

describe('computeEarningsScore', () => {
	it('keeps a missing ROA percentile unscored', () => {
		expect(computeEarningsScore(null, null)).toBeNull();
	});

	it('returns percentile value when no trend penalty', () => {
		expect(computeEarningsScore(75, null)).toBe(75);
		expect(computeEarningsScore(30, null)).toBe(30);
	});

	it('applies penalty for negative ROA trend slope', () => {
		const withoutTrend = computeEarningsScore(80, null);
		const withDecline = computeEarningsScore(80, -0.1);
		expect(withDecline!).toBeLessThan(withoutTrend!);
	});

	it('caps penalty at 15 points', () => {
		// Even with a very steep negative slope, penalty is max 15
		const score = computeEarningsScore(80, -10.0);
		expect(score).toBe(65);
	});

	it('no penalty for positive trend slope', () => {
		expect(computeEarningsScore(60, 0.5)).toBe(60);
	});

	it('never goes below 0', () => {
		expect(computeEarningsScore(5, -1.0)).toBeGreaterThanOrEqual(0);
	});

	it('never exceeds 100', () => {
		expect(computeEarningsScore(100, 0.5)).toBeLessThanOrEqual(100);
	});

	it('zero slope means no penalty', () => {
		expect(computeEarningsScore(50, 0)).toBe(50);
	});
});

// --- Liquidity Score ---

describe('computeLiquidityScore', () => {
	it('keeps a missing input unscored', () => {
		expect(computeLiquidityScore(null)).toBeNull();
	});

	it('returns 100 for 0th percentile LTD (most liquid)', () => {
		expect(computeLiquidityScore(0)).toBe(100);
	});

	it('returns 0 for 100th percentile LTD (least liquid)', () => {
		expect(computeLiquidityScore(100)).toBe(0);
	});

	it('inverts the percentile linearly', () => {
		expect(computeLiquidityScore(25)).toBe(75);
		expect(computeLiquidityScore(50)).toBe(50);
		expect(computeLiquidityScore(75)).toBe(25);
	});

	it('clamps to 0-100 range', () => {
		// Edge: if somehow percentile > 100
		expect(computeLiquidityScore(150)).toBe(0);
		expect(computeLiquidityScore(-50)).toBe(100);
	});
});

describe('computeEmpiricalPercentile', () => {
	it('uses observed ranks for a skewed distribution', () => {
		const distribution = [0, 0, 0, 1, 1000];

		expect(computeEmpiricalPercentile(0, distribution)).toBe(30);
		expect(computeEmpiricalPercentile(1, distribution)).toBe(70);
		expect(computeEmpiricalPercentile(1000, distribution)).toBe(90);
	});

	it('assigns tied values the same midpoint rank', () => {
		const distribution = [1, 2, 2, 2, 3, 4];

		expect(computeEmpiricalPercentile(2, distribution)).toBeCloseTo(41.6667, 4);
	});

	it('returns the cohort midpoint when every value is tied', () => {
		expect(computeEmpiricalPercentile(2, [2, 2, 2, 2])).toBe(50);
	});

	it('does not rank missing values or a one-bank cohort', () => {
		expect(computeEmpiricalPercentile(null, [1, 2])).toBeNull();
		expect(computeEmpiricalPercentile(1, [1])).toBeNull();
	});
});
