import { describe, it, expect } from 'vitest';
import {
	classifyPCA,
	computeCapitalScore,
	computeAssetQualityScore,
	computeEarningsScore,
	computeLiquidityScore,
	normalCDF,
	computePercentileFromPeer
} from './risk-scores';

// --- PCA Classification ---

describe('classifyPCA', () => {
	it('defaults to well_capitalized when all inputs are null', () => {
		expect(classifyPCA({ rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null })).toBe('well_capitalized');
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

	it('classifies critically undercapitalized (leverage <= 2%)', () => {
		expect(classifyPCA({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 2 })).toBe('critically_undercapitalized');
		expect(classifyPCA({ rbcrwaj: 5, rbc1rwaj: 3, rbc1aaj: 1 })).toBe('critically_undercapitalized');
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
});

// --- Capital Score ---

describe('computeCapitalScore', () => {
	it('returns 5 for critically undercapitalized', () => {
		expect(computeCapitalScore({ rbcrwaj: 3, rbc1rwaj: 2, rbc1aaj: 1 })).toBe(5);
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

	it('handles all-null inputs (defaults to well_capitalized, score 60+)', () => {
		const score = computeCapitalScore({ rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null });
		// classifyPCA returns well_capitalized, but all null means avgBuffer=0 (count=0)
		// So score should be in the well_capitalized range
		expect(score).toBeGreaterThanOrEqual(60);
	});

	it('increases with buffer above thresholds', () => {
		const lowBuffer = computeCapitalScore({ rbcrwaj: 11, rbc1rwaj: 9, rbc1aaj: 6 });
		const highBuffer = computeCapitalScore({ rbcrwaj: 15, rbc1rwaj: 13, rbc1aaj: 10 });
		expect(highBuffer).toBeGreaterThan(lowBuffer);
	});
});

// --- Asset Quality Score ---

describe('computeAssetQualityScore', () => {
	it('returns 50 for null input', () => {
		expect(computeAssetQualityScore(null)).toBe(50);
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
		const scores = [0, 10, 25, 50, 75, 90, 100].map(computeAssetQualityScore);
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
		}
	});
});

// --- Earnings Score ---

describe('computeEarningsScore', () => {
	it('returns 50 for null ROA percentile', () => {
		expect(computeEarningsScore(null, null)).toBe(50);
	});

	it('returns percentile value when no trend penalty', () => {
		expect(computeEarningsScore(75, null)).toBe(75);
		expect(computeEarningsScore(30, null)).toBe(30);
	});

	it('applies penalty for negative ROA trend slope', () => {
		const withoutTrend = computeEarningsScore(80, null);
		const withDecline = computeEarningsScore(80, -0.1);
		expect(withDecline).toBeLessThan(withoutTrend);
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
	it('returns 50 for null input', () => {
		expect(computeLiquidityScore(null)).toBe(50);
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

// --- Normal CDF ---

describe('normalCDF', () => {
	it('returns ~0.5 at z=0', () => {
		expect(normalCDF(0)).toBeCloseTo(0.5, 4);
	});

	it('returns ~0.8413 at z=1', () => {
		expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
	});

	it('returns ~0.1587 at z=-1', () => {
		expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
	});

	it('returns ~0.9772 at z=2', () => {
		expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
	});

	it('returns 0 for very negative z', () => {
		expect(normalCDF(-7)).toBe(0);
	});

	it('returns 1 for very positive z', () => {
		expect(normalCDF(7)).toBe(1);
	});

	it('is monotonically increasing', () => {
		const zValues = [-3, -2, -1, 0, 1, 2, 3];
		const cdfValues = zValues.map(normalCDF);
		for (let i = 1; i < cdfValues.length; i++) {
			expect(cdfValues[i]).toBeGreaterThan(cdfValues[i - 1]);
		}
	});

	it('is symmetric: CDF(z) + CDF(-z) ~= 1', () => {
		for (const z of [0.5, 1, 1.5, 2, 2.5, 3]) {
			expect(normalCDF(z) + normalCDF(-z)).toBeCloseTo(1, 4);
		}
	});
});

// --- computePercentileFromPeer ---

describe('computePercentileFromPeer', () => {
	const peerMap = new Map([
		['asset_bucket:3:roa', { mean: 1.0, stddev: 0.5, count: 100 }],
		['asset_bucket:3:nclnlsr', { mean: 2.0, stddev: 0.0, count: 100 }]
	]);

	it('returns null when value is null', () => {
		expect(computePercentileFromPeer(null, 'asset_bucket:3', 'roa', peerMap)).toBeNull();
	});

	it('returns null when peerGroup is null', () => {
		expect(computePercentileFromPeer(1.0, null, 'roa', peerMap)).toBeNull();
	});

	it('returns 50 when stddev is 0 (no variance)', () => {
		expect(computePercentileFromPeer(2.0, 'asset_bucket:3', 'nclnlsr', peerMap)).toBe(50);
	});

	it('returns 50 when peer stats not found', () => {
		expect(computePercentileFromPeer(1.0, 'asset_bucket:99', 'roa', peerMap)).toBe(50);
	});

	it('returns ~50 when value equals peer mean', () => {
		const result = computePercentileFromPeer(1.0, 'asset_bucket:3', 'roa', peerMap);
		expect(result).toBeCloseTo(50, 0);
	});

	it('returns > 50 when value is above peer mean', () => {
		const result = computePercentileFromPeer(2.0, 'asset_bucket:3', 'roa', peerMap);
		expect(result!).toBeGreaterThan(50);
	});

	it('returns < 50 when value is below peer mean', () => {
		const result = computePercentileFromPeer(0.0, 'asset_bucket:3', 'roa', peerMap);
		expect(result!).toBeLessThan(50);
	});

	it('returns value between 0 and 100', () => {
		const result = computePercentileFromPeer(5.0, 'asset_bucket:3', 'roa', peerMap);
		expect(result!).toBeGreaterThanOrEqual(0);
		expect(result!).toBeLessThanOrEqual(100);
	});
});
