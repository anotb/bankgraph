import { describe, expect, it } from 'vitest';
import {
	ANOMALY_METHOD_VERSION,
	RISK_METHOD_VERSION,
	buildAnomalyMethodology,
	buildRiskHistoryComparison,
	buildRiskMethodology
} from './analysis-methodology';

describe('analysis methodology metadata', () => {
	it('reports risk component coverage without treating missing capital as covered', () => {
		const metadata = buildRiskMethodology({
			capital: null,
			asset_quality: 70,
			earnings: 60,
			liquidity: 50,
			composite: 61
		});

		expect(metadata.version).toBe(RISK_METHOD_VERSION);
		expect(metadata.peer_percentile_method).toBe('exact_empirical_midrank');
		expect(metadata.peer_cohort).toBe('same_period_asset_bucket');
		expect(metadata.coverage).toEqual({
			available_components: 3,
			total_components: 4,
			ratio: 0.75,
			required_components: 3,
			included_components: ['asset_quality', 'earnings', 'liquidity'],
			missing_components: ['capital'],
			composite_status: 'partial'
		});
		expect(metadata.method).toContain('exact same-quarter empirical ranks');
		expect(metadata.method).toContain('at least three of four components');
		expect(metadata.method).toContain('not an official PCA');
	});

	it('marks a two-component composite unavailable even if an older stored score exists', () => {
		const metadata = buildRiskMethodology({
			capital: 80,
			asset_quality: 70,
			earnings: null,
			liquidity: null,
			composite: 76
		});

		expect(metadata.coverage.composite_status).toBe('unavailable');
		expect(metadata.coverage.required_components).toBe(3);
	});

	it('blocks a continuous history when the component set changes', () => {
		const comparison = buildRiskHistoryComparison([
			{ capital: 80, asset_quality: 70, earnings: 60, liquidity: null, composite: 71 },
			{ capital: 82, asset_quality: 72, earnings: 62, liquidity: 55, composite: 70 }
		]);

		expect(comparison.status).toBe('coverage_changed');
		expect(comparison.coverage_signatures).toEqual([
			'capital|asset_quality|earnings',
			'capital|asset_quality|earnings|liquidity'
		]);
	});

	it('allows history only when every point has a composite from the same components', () => {
		const comparison = buildRiskHistoryComparison([
			{ capital: 80, asset_quality: 70, earnings: 60, liquidity: null, composite: 71 },
			{ capital: 82, asset_quality: 72, earnings: 62, liquidity: null, composite: 73 }
		]);

		expect(comparison.status).toBe('comparable');
	});

	it('preserves explicit anomaly source-data coverage and version', () => {
		const coverage = {
			from_repdte: '20230331',
			to_repdte: '20240331',
			quarter_count: 5,
			requested_repdte: null
		};
		const metadata = buildAnomalyMethodology(coverage);

		expect(metadata.version).toBe(ANOMALY_METHOD_VERSION);
		expect(metadata.coverage).toEqual(coverage);
		expect(metadata.method).toContain('median/MAD');
	});
});
