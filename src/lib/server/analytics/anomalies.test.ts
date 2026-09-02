import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	buildPeerReferenceStats,
	classifyCapitalReferenceSeverity,
	classifySignalDirection,
	detectAnomalies,
	isUsableMetricValue,
	severityForStatisticalSignal
} from './anomalies';

// ─── Mock DB Helpers ─────────────────────────────────────────────────────────

function createMockStatement(returnValue: unknown = {}) {
	const stmt: any = {
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(returnValue),
		all: vi.fn().mockResolvedValue({ results: returnValue }),
		run: vi.fn().mockResolvedValue({ success: true })
	};
	return stmt;
}

/**
 * Creates a mock D1Database where `queryAll` calls can be routed
 * based on the SQL string. Pass a map of SQL-substring -> results.
 */
function createRoutingMockDB(routeMap: Record<string, unknown[]> = {}) {
	const db: any = {
		prepare: vi.fn().mockImplementation((sql: string) => {
			const stmt: any = {
				bind: vi.fn().mockReturnThis(),
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockImplementation(() => {
					for (const [key, value] of Object.entries(routeMap)) {
						if (sql.includes(key)) {
							// Support callable for dynamic per-call results
							if (typeof value === 'function') {
								return { results: (value as () => unknown[])() };
							}
							return { results: value };
						}
					}
					return { results: [] };
				}),
				run: vi.fn().mockResolvedValue({ success: true })
			};
			return stmt;
		}),
		batch: vi.fn().mockResolvedValue([])
	};
	return db;
}

/**
 * More flexible mock that tracks calls and lets us return different results
 * for sequential calls to the same query pattern.
 */
function createSequentialMockDB(callResponses: Array<{ match: string; results: unknown[] }>) {
	let callIndex = 0;
	const db: any = {
		prepare: vi.fn().mockImplementation((sql: string) => {
			const currentSql = sql;
			const stmt: any = {
				bind: vi.fn().mockReturnThis(),
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockImplementation(() => {
					// Find the next matching response
					for (let i = callIndex; i < callResponses.length; i++) {
						if (currentSql.includes(callResponses[i].match)) {
							callIndex = i + 1;
							return { results: callResponses[i].results };
						}
					}
					return { results: [] };
				}),
				run: vi.fn().mockResolvedValue({ success: true })
			};
			return stmt;
		}),
		batch: vi.fn().mockResolvedValue([])
	};
	return db;
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('detectAnomalies', () => {
	it('returns 0 and inserts nothing when there are no anomalies', async () => {
		const db = createRoutingMockDB({});
		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});
});

describe('honest signal classification', () => {
	it('separates favorable/adverse direction from statistical severity', () => {
		expect(classifySignalDirection('roa', 1)).toBe('favorable');
		expect(classifySignalDirection('roa', -1)).toBe('adverse');
		expect(classifySignalDirection('nclnlsr', 1)).toBe('adverse');
		expect(severityForStatisticalSignal('favorable')).toBe('info');
		expect(severityForStatisticalSignal('adverse')).toBe('warning');
		expect(severityForStatisticalSignal('indeterminate')).toBe('info');
	});

	it('reserves critical for a positive reported ratio below a minimum capital reference', () => {
		expect(classifyCapitalReferenceSeverity(7, 8, 10)).toBe('critical');
		expect(classifyCapitalReferenceSeverity(9, 8, 10)).toBe('warning');
		expect(classifyCapitalReferenceSeverity(10.5, 8, 10)).toBe('info');
		expect(classifyCapitalReferenceSeverity(12, 8, 10)).toBeNull();
	});

	it('treats zero capital ratios as unavailable without applicability evidence', () => {
		expect(isUsableMetricValue('rbcrwaj', 0)).toBe(false);
		expect(isUsableMetricValue('rbc1rwaj', 0)).toBe(false);
		expect(isUsableMetricValue('rbc1aaj', 0)).toBe(false);
		expect(classifyCapitalReferenceSeverity(0, 8, 10)).toBeNull();
		expect(isUsableMetricValue('roa', 0)).toBe(true);
	});

	it('uses median/MAD only for a sufficiently covered deterministic peer sample', () => {
		const observations = Array.from({ length: 20 }, (_, index) => ({
			asset_bucket: 3,
			roa: 0.5 + index * 0.05
		}));
		const stats = buildPeerReferenceStats(
			[{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 99, stddev: 50 }],
			observations
		).get('asset_bucket:3:roa');

		expect(stats?.method).toBe('median_mad');
		expect(stats?.count).toBe(20);
		expect(stats?.center).toBeCloseTo(0.975);
		expect(stats?.scale).toBeGreaterThan(0);
	});

	it('falls back to recorded mean/stddev when robust peer coverage is too small', () => {
		const stats = buildPeerReferenceStats(
			[{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1, stddev: 0.5 }],
			[{ asset_bucket: 3, roa: 4 }]
		).get('asset_bucket:3:roa');

		expect(stats).toMatchObject({
			center: 1,
			scale: 0.5,
			count: 1,
			method: 'mean_stdev'
		});
	});
});

// ─── QoQ Spike Detection ─────────────────────────────────────────────────────

describe('QoQ Spike Detection', () => {
	it('detects a large favorable movement without implying a critical condition', async () => {
		const db = createRoutingMockDB({
			// Previous quarter lookup
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// Bank with a large favorable ROA change: 0.5 -> 1.5 = 1.0
			'FROM financials c': [
				{ cert: 1, curr_roa: 1.5, prev_roa: 0.5, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			// No peer stats / other detectors
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);

		// Verify batchInsert was called with anomalies
		expect(db.batch).toHaveBeenCalled();
		const batchArgs = db.batch.mock.calls[0][0];
		// The batch includes the statement objects. We check prepare was called with INSERT
		const insertCalls = db.prepare.mock.calls.filter(
			(call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT')
		);
		expect(insertCalls.length).toBeGreaterThan(0);
	});

	it('detects an unusual movement between warning and large-movement thresholds', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// ROA change: 1.0 -> 1.4 = 0.4, warning=0.30, large=0.60
			'FROM financials c': [
				{ cert: 1, curr_roa: 1.4, prev_roa: 1.0, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('does not flag changes below warning threshold', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// ROA change: 1.0 -> 1.1 = 0.1, below warning=0.30
			'FROM financials c': [
				{ cert: 1, curr_roa: 1.1, prev_roa: 1.0, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('returns 0 when there is no previous quarter', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips metrics with null current or previous values', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// null curr_roa and prev_roe
			'FROM financials c': [
				{ cert: 1, curr_roa: null, prev_roa: 0.5, curr_roe: 10, prev_roe: null, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// nimy change=0, nclnlsr change=0, rbcrwaj change=0 -> all below threshold
		expect(count).toBe(0);
	});

	it('detects spikes in both directions (increase and decrease)', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			'FROM financials c': [
				// ROA decreased by 1.0 (adverse warning), ROE increased by 7.0 (favorable info)
				{ cert: 1, curr_roa: -0.5, prev_roa: 0.5, curr_roe: 17, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// Both directions remain visible, with direction-specific non-critical severities.
		expect(count).toBeGreaterThanOrEqual(2);
	});

	it('detects spikes for multiple metrics simultaneously', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			'FROM financials c': [
				{
					cert: 1,
					curr_roa: 2.0, prev_roa: 0.5,   // large favorable movement -> info
					curr_roe: 20, prev_roe: 10,       // large favorable movement -> info
					curr_nimy: 4.0, prev_nimy: 3.0,   // large favorable movement -> info
					curr_nclnlsr: 5.0, prev_nclnlsr: 1.0, // large adverse movement -> warning
					curr_rbcrwaj: 20, prev_rbcrwaj: 12 // large favorable movement -> info
				}
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(5);
	});
});

// ─── Peer Outlier Detection ──────────────────────────────────────────────────

describe('Peer Outlier Detection', () => {
	it('flags a statistically rare favorable peer value as informational', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			// Bank with roa = 2.8 -> z = (2.8-1.0)/0.5 = 3.6
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 2.8, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('flags warning peer outlier when z-score between 2.0 and 3.0 (adverse direction)', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			// Bank with roa = -0.2 -> z = (-0.2-1.0)/0.5 = -2.4 (adverse for LOW_IS_ADVERSE)
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: -0.2, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('does not flag when z-score < 2.0', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			// Bank with roa = 1.8 -> z = (1.8-1.0)/0.5 = 1.6 < 2.0
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 1.8, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips banks with null asset_bucket', async () => {
		// The SQL itself filters WHERE asset_bucket IS NOT NULL,
		// so we simply return no banks and expect 0 anomalies
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips metrics with null values', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips when peer stats not found for a given metric', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			// No peer stats for roa
			'peer_stats': [
				{ peer_group: 'asset_bucket:5', metric: 'roe', mean: 10.0, stddev: 2.0 }
			],
			// Bank in bucket 3 - no matching stats
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 5.0, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});
});

// ─── LOW_IS_ADVERSE / HIGH_IS_ADVERSE Direction Logic ────────────────────────

describe('Adverse direction logic', () => {
	/**
	 * Fixed logic (was previously a bug where line 186 was dead code):
	 *   if (absZ < 2.0) continue;              // never flag below 2.0
	 *   if (absZ < 3.0 && !isAdverse) continue; // moderate non-adverse: skip
	 *
	 * Behavior:
	 *   absZ < 2.0:  never flag
	 *   absZ 2.0-3.0: only flag if adverse direction
	 *   absZ >= 3.0:  always flag regardless of direction
	 */

	it('flags adverse LOW_IS_ADVERSE metric (roa below mean) at z >= 2.0', async () => {
		// roa is LOW_IS_ADVERSE: low values are bad
		// z = (value - mean) / stddev = (-0.5 - 1.0) / 0.5 = -3.0 (adverse, warning)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: -0.5, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('flags non-adverse LOW_IS_ADVERSE metric (roa above mean) at z >= 3.0 (extreme)', async () => {
		// roa is LOW_IS_ADVERSE, but value is HIGH -> z > 0 -> NOT adverse
		// z = (2.5 - 1.0) / 0.5 = 3.0 (non-adverse but extreme -> still flagged)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 2.5, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 3.0 >= 3.0 -> flagged regardless of direction
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('does NOT flag non-adverse LOW_IS_ADVERSE metric at z between 2.0 and 3.0', async () => {
		// roa is LOW_IS_ADVERSE, but value is HIGH -> z > 0 -> NOT adverse
		// z = (2.2 - 1.0) / 0.5 = 2.4 (non-adverse, moderate -> skipped)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 2.2, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 2.4, non-adverse -> skipped
		expect(count).toBe(0);
	});

	it('flags adverse LOW_IS_ADVERSE metric at z between 2.0 and 3.0', async () => {
		// roa is LOW_IS_ADVERSE, value is LOW -> z < 0 -> adverse
		// z = (-0.2 - 1.0) / 0.5 = -2.4 (adverse, moderate -> flagged as warning)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: -0.2, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 2.4, adverse -> flagged
		expect(count).toBe(1);
	});

	it('flags HIGH_IS_ADVERSE metric (nclnlsr above mean) at z >= 2.0', async () => {
		// nclnlsr is HIGH_IS_ADVERSE: high values are bad
		// z = (6.0 - 2.0) / 1.0 = 4.0 (adverse, warning)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'nclnlsr', mean: 2.0, stddev: 1.0 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: 6.0, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('flags non-adverse HIGH_IS_ADVERSE metric (nclnlsr below mean) at z >= 3.0 (extreme)', async () => {
		// nclnlsr is HIGH_IS_ADVERSE, but value is LOW -> z < 0 -> NOT adverse
		// z = (-1.0 - 2.0) / 1.0 = -3.0 (non-adverse but extreme -> flagged)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'nclnlsr', mean: 2.0, stddev: 1.0 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: -1.0, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 3.0 >= 3.0 -> flagged regardless of direction
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('does NOT flag non-adverse HIGH_IS_ADVERSE metric at z between 2.0 and 3.0', async () => {
		// nclnlsr is HIGH_IS_ADVERSE, but value is LOW -> z < 0 -> NOT adverse
		// z = (-0.5 - 2.0) / 1.0 = -2.5 (non-adverse, moderate -> skipped)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'nclnlsr', mean: 2.0, stddev: 1.0 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: -0.5, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 2.5, non-adverse -> skipped
		expect(count).toBe(0);
	});

	it('flags adverse HIGH_IS_ADVERSE metric at z between 2.0 and 3.0', async () => {
		// nclnlsr is HIGH_IS_ADVERSE, value is HIGH -> z > 0 -> adverse
		// z = (4.5 - 2.0) / 1.0 = 2.5 (adverse, moderate -> flagged as warning)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'nclnlsr', mean: 2.0, stddev: 1.0 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: 4.5, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// absZ = 2.5, adverse -> flagged
		expect(count).toBe(1);
	});

	it('does NOT flag z-score between 1.5 and 2.0 even in adverse direction', async () => {
		// z = (-0.8 - 1.0) / 1.0 = -1.8 (adverse direction for LOW_IS_ADVERSE)
		// But absZ = 1.8 < 2.0 -> always skipped
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 1.0 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: -0.8, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});
});

// ─── Capital Reference Threshold Detection ──────────────────────────────────

describe('Capital reference threshold detection', () => {
	it('flags critical when capital ratio is below adequately-capitalized threshold', async () => {
		// rbcrwaj < 8 (adequately_cap)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 7.0, rbc1rwaj: 5.0, rbc1aaj: 3.0 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// All three ratios are below their adequately_cap thresholds
		expect(count).toBeGreaterThanOrEqual(3);
	});

	it('flags warning when below the upper reference but above the minimum reference', async () => {
		// rbcrwaj between 8 and 10 (below well_cap=10 but above adequately_cap=8)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 9.0, rbc1rwaj: 7.0, rbc1aaj: 4.5 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(3);
	});

	it('flags info when within 100bps above the upper capital reference', async () => {
		// rbcrwaj = 10.5: well_cap=10, buffer=0.5 < 1.0 -> warning
		// rbc1rwaj = 8.5: well_cap=8, buffer=0.5 < 1.0 -> warning
		// rbc1aaj = 5.5: well_cap=5, buffer=0.5 < 1.0 -> warning
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 10.5, rbc1rwaj: 8.5, rbc1aaj: 5.5 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(3);
	});

	it('does not flag when comfortably above the upper capital reference', async () => {
		// rbcrwaj = 14 (buffer = 4.0 >= 1.0), rbc1rwaj = 12 (buffer = 4.0 >= 1.0), rbc1aaj = 8 (buffer = 3.0 >= 1.0)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 14.0, rbc1rwaj: 12.0, rbc1aaj: 8.0 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips null capital ratios', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: null, rbc1rwaj: null, rbc1aaj: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('skips zero capital ratios across threshold and peer signal paths', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			'FROM financials c': [
				{ cert: 100, curr_roa: 1, prev_roa: 1, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 0, prev_rbcrwaj: 12 }
			],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'rbcrwaj', mean: 12, stddev: 2 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: null, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: 0, lnlsdepr: null, eqv: null, rbc1rwaj: 0, rbc1aaj: 0 }
			],
			'bank_trends': []
		});

		expect(await detectAnomalies(db, '20240331')).toBe(0);
	});

	it('detects exactly-at-threshold values correctly', async () => {
		// Exactly at well_cap thresholds: buffer = 0.0 < 1.0 -> warning
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 10.0, rbc1rwaj: 8.0, rbc1aaj: 5.0 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// value - well_cap = 0.0 < 1.0 -> warning for all three
		expect(count).toBe(3);
	});

	it('treats the exact minimum reference as a warning below the upper reference', async () => {
		// Exactly at adequately_cap: rbcrwaj=8, rbc1rwaj=6, rbc1aaj=4
		// These are >= the minimum reference but < the upper reference -> warning
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 8.0, rbc1rwaj: 6.0, rbc1aaj: 4.0 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// All three: >= minimum reference but < upper reference -> warning
		expect(count).toBe(3);
	});

	it('handles mixed severity across different ratios', async () => {
		// rbcrwaj = 14 (safe), rbc1rwaj = 7 (below upper but above minimum, warning), rbc1aaj = 5.3 (info)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 14.0, rbc1rwaj: 7.0, rbc1aaj: 5.3 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// rbc1rwaj -> warning, rbc1aaj -> info (buffer=0.3 < 1.0)
		expect(count).toBe(2);
	});
});

// ─── Trend Reversal Detection ────────────────────────────────────────────────

describe('Trend Reversal Detection', () => {
	it('detects warning trend reversal when avg R² > 0.5', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [{ repdte: '20231231' }],
			'FROM bank_trends c': [
				{ cert: 100, metric: 'roa', curr_slope: 0.05, prev_slope: -0.03, curr_r2: 0.7, prev_r2: 0.6 }
			]
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('detects info trend reversal when avg R² between 0.3 and 0.5', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [{ repdte: '20231231' }],
			'FROM bank_trends c': [
				{ cert: 100, metric: 'roa', curr_slope: 0.05, prev_slope: -0.03, curr_r2: 0.4, prev_r2: 0.35 }
			]
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});

	it('does not flag when avg R² <= 0.3 (weak trend)', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [{ repdte: '20231231' }],
			'FROM bank_trends c': [
				{ cert: 100, metric: 'roa', curr_slope: 0.05, prev_slope: -0.03, curr_r2: 0.2, prev_r2: 0.1 }
			]
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('returns 0 when there is no previous quarter in bank_trends', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [],
			'FROM bank_trends c': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('detects downward reversal', async () => {
		// positive -> negative slope
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [{ repdte: '20231231' }],
			'FROM bank_trends c': [
				{ cert: 100, metric: 'roa', curr_slope: -0.05, prev_slope: 0.03, curr_r2: 0.8, prev_r2: 0.7 }
			]
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBeGreaterThanOrEqual(1);
	});
});

// ─── Severity Classification (Peer Outlier z-score thresholds) ───────────────

describe('Severity classification by z-score', () => {
	it('z=2.0 exactly yields warning severity (adverse direction)', async () => {
		// Use adverse direction: roa is LOW_IS_ADVERSE, so z < 0 is adverse
		// z = (0.0 - 1.0) / 0.5 = -2.0 (adverse)
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 0.0, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// z=-2.0 -> absZ=2.0, adverse -> flagged as warning (absZ < 3.0)
		expect(count).toBe(1);
	});

	it('z=3.0 exactly remains a non-critical statistical signal', async () => {
		// z = (2.5 - 1.0) / 0.5 = 3.0
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 2.5, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// z=3.0 is rare, but favorable ROA remains informational.
		expect(count).toBe(1);
	});

	it('z=1.99 is not flagged', async () => {
		// z = (1.995 - 1.0) / 0.5 = 1.99
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 1.995, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
	it('handles empty database (no rows at all)', async () => {
		const db = createRoutingMockDB({});
		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('handles zero variance (stddev = 0) in peer stats', async () => {
		// The SQL filter "stddev > 0" ensures zero-stddev rows are excluded
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				// stddev=0 should not be in results due to SQL WHERE clause
				// But if it somehow shows up, it shouldn't cause division by zero
			],
			'FROM financials WHERE repdte': [
				{ cert: 100, asset_bucket: 3, roa: 1.0, roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('handles single data point (one bank, one quarter)', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 100, rbcrwaj: 14.0, rbc1rwaj: 12.0, rbc1aaj: 8.0 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);
	});

	it('clears existing anomalies before re-running', async () => {
		const db = createRoutingMockDB({});

		await detectAnomalies(db, '20240331');

		// Verify DELETE was called
		const deleteCalls = db.prepare.mock.calls.filter(
			(call: any[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM anomalies')
		);
		expect(deleteCalls.length).toBe(1);
	});

	it('runs all four detectors in parallel', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			'FROM financials c': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'DISTINCT repdte FROM bank_trends': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		expect(count).toBe(0);

		// The function should still have called prepare for each detector's queries
		expect(db.prepare.mock.calls.length).toBeGreaterThanOrEqual(1);
	});

	it('handles multiple banks in capital reference detection', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [],
			'FROM financials WHERE repdte': [
				{ cert: 1, rbcrwaj: 7.0, rbc1rwaj: 5.0, rbc1aaj: 3.0 },
				{ cert: 2, rbcrwaj: 14.0, rbc1rwaj: 12.0, rbc1aaj: 8.0 },
				{ cert: 3, rbcrwaj: null, rbc1rwaj: null, rbc1aaj: 4.2 }
			],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// cert 1: all three below adequately_cap -> 3 critical
		// cert 2: all safe -> 0
		// cert 3: only rbc1aaj=4.2 -> below upper reference but above minimum -> warning
		expect(count).toBe(4);
	});

	it('handles QoQ spike at exact warning threshold boundary', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// ROA change = exactly 0.30 (warning threshold)
			'FROM financials c': [
				{ cert: 1, curr_roa: 1.3, prev_roa: 1.0, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// change = 0.30 >= warning threshold 0.30 -> should flag
		expect(count).toBe(1);
	});

	it('handles QoQ movement at the exact large-movement boundary', async () => {
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			// ROA change = exactly 0.60 (large-movement threshold)
			'FROM financials c': [
				{ cert: 1, curr_roa: 1.6, prev_roa: 1.0, curr_roe: 10, prev_roe: 10, curr_nimy: 3, prev_nimy: 3, curr_nclnlsr: 1, prev_nclnlsr: 1, curr_rbcrwaj: 12, prev_rbcrwaj: 12 }
			],
			'peer_stats': [],
			'FROM financials WHERE repdte': [],
			'bank_trends': []
		});

		const count = await detectAnomalies(db, '20240331');
		// The movement is large, but favorable ROA remains informational.
		expect(count).toBe(1);
	});

	it('processes multiple batches of banks for peer outliers', async () => {
		// Create > BANK_BATCH_SIZE (200) banks to test pagination
		const manyBanks = Array.from({ length: 250 }, (_, i) => ({
			cert: i + 1,
			asset_bucket: 3,
			roa: 1.0, // at the mean, no outlier
			roe: null, nimy: null, eeffr: null, nclnlsr: null, rbcrwaj: null, lnlsdepr: null, eqv: null
		}));

		let callCount = 0;
		const db = createRoutingMockDB({
			'DISTINCT repdte FROM financials': [],
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'roa', mean: 1.0, stddev: 0.5 }
			],
			'bank_trends': []
		});

		// Override the financials query to return batches
		const originalPrepare = db.prepare;
		db.prepare = vi.fn().mockImplementation((sql: string) => {
			const result = originalPrepare(sql);
			if (sql.includes('FROM financials WHERE repdte') && sql.includes('LIMIT')) {
				result.all = vi.fn().mockImplementation(() => {
					callCount++;
					if (callCount === 1) {
						return { results: manyBanks.slice(0, 200) };
					} else if (callCount === 2) {
						return { results: manyBanks.slice(200) };
					}
					return { results: [] };
				});
			}
			return result;
		});

		const count = await detectAnomalies(db, '20240331');
		// All banks at the mean -> no outliers
		expect(count).toBe(0);
	});
});

// ─── Integration: Combined Anomaly Types ─────────────────────────────────────

describe('Integration: combined detection', () => {
	it('counts anomalies from all four detectors', async () => {
		const db = createRoutingMockDB({
			// QoQ spike
			'DISTINCT repdte FROM financials': [{ repdte: '20231231' }],
			'FROM financials c': [
				{
					cert: 1,
					curr_roa: 2.0, prev_roa: 0.5,   // large favorable movement -> info
					curr_roe: 10, prev_roe: 10,
					curr_nimy: 3, prev_nimy: 3,
					curr_nclnlsr: 1, prev_nclnlsr: 1,
					curr_rbcrwaj: 12, prev_rbcrwaj: 12
				}
			],
			// Peer outlier
			'peer_stats': [
				{ peer_group: 'asset_bucket:3', metric: 'eeffr', mean: 60, stddev: 5 }
			],
			// Capital reference breach + peer outlier banks
			'FROM financials WHERE repdte': [
				{
					cert: 2,
					asset_bucket: 3,
					roa: null, roe: null, nimy: null,
					eeffr: 80, // z = (80-60)/5 = 4.0 adverse -> warning
					nclnlsr: null, rbcrwaj: 7.0, lnlsdepr: null, eqv: null,
					rbc1rwaj: 5.0, rbc1aaj: 3.0
				}
			],
			// Trend reversal
			'DISTINCT repdte FROM bank_trends': [{ repdte: '20231231' }],
			'FROM bank_trends c': [
				{ cert: 3, metric: 'roa', curr_slope: 0.05, prev_slope: -0.03, curr_r2: 0.8, prev_r2: 0.7 }
			]
		});

		const count = await detectAnomalies(db, '20240331');
		// QoQ movement: 1 (roa favorable info)
		// Peer outlier: 1 (eeffr adverse warning)
		// Capital reference breaches: 3 (all below minimum references)
		// Trend reversal: 1 (roa warning)
		expect(count).toBeGreaterThanOrEqual(4);
	});
});
