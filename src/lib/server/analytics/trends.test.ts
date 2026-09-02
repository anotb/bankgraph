import { describe, it, expect, vi } from 'vitest';
import {
	buildTrendRowsForHistory,
	computeAllTrends,
	linearRegression,
	TREND_BANK_BATCH_SIZE
} from './trends';
import { fdicQuarterDistance, fdicQuarterIndex } from '$lib/utils/fdic-quarter';

describe('FDIC quarter distance', () => {
	it('measures quarter boundaries and rejects dates that are not exact quarter ends', () => {
		expect(fdicQuarterDistance('20231231', '20240331')).toBe(1);
		expect(fdicQuarterDistance('20230331', '20240331')).toBe(4);
		expect(fdicQuarterDistance('20240930', '20240331')).toBe(-2);
		expect(fdicQuarterIndex(null)).toBeNull();
		expect(fdicQuarterDistance('20240629', '20240930')).toBeNull();
	});
});

describe('linearRegression', () => {
	it('returns zeros for fewer than 2 points', () => {
		expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r_squared: 0 });
		expect(linearRegression([{ x: 1, y: 5 }])).toEqual({ slope: 0, intercept: 0, r_squared: 0 });
	});

	it('fits a perfect line y = 2x + 1', () => {
		const points = [
			{ x: 0, y: 1 },
			{ x: 1, y: 3 },
			{ x: 2, y: 5 },
			{ x: 3, y: 7 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(2.0, 10);
		expect(result.intercept).toBeCloseTo(1.0, 10);
		expect(result.r_squared).toBeCloseTo(1.0, 10);
	});

	it('fits a horizontal line (slope 0)', () => {
		const points = [
			{ x: 0, y: 5 },
			{ x: 1, y: 5 },
			{ x: 2, y: 5 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(0, 10);
		expect(result.intercept).toBeCloseTo(5, 10);
		// R-squared is 0 when all y are the same (no variance to explain)
		expect(result.r_squared).toBe(0);
	});

	it('computes R-squared between 0 and 1 for noisy data', () => {
		const points = [
			{ x: 0, y: 1.1 },
			{ x: 1, y: 2.9 },
			{ x: 2, y: 5.2 },
			{ x: 3, y: 6.8 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeGreaterThan(1.5);
		expect(result.slope).toBeLessThan(2.5);
		expect(result.r_squared).toBeGreaterThan(0.95);
		expect(result.r_squared).toBeLessThanOrEqual(1.0);
	});

	it('handles negative slope', () => {
		const points = [
			{ x: 0, y: 10 },
			{ x: 1, y: 8 },
			{ x: 2, y: 6 },
			{ x: 3, y: 4 }
		];
		const result = linearRegression(points);

		expect(result.slope).toBeCloseTo(-2.0, 10);
		expect(result.intercept).toBeCloseTo(10.0, 10);
		expect(result.r_squared).toBeCloseTo(1.0, 10);
	});

	it('handles all-same x values (degenerate case)', () => {
		const points = [
			{ x: 3, y: 1 },
			{ x: 3, y: 2 },
			{ x: 3, y: 3 }
		];
		const result = linearRegression(points);

		// denom is 0, so slope = 0, intercept = mean(y)
		expect(result.slope).toBe(0);
		expect(result.intercept).toBeCloseTo(2.0, 10);
		expect(result.r_squared).toBe(0);
	});
});

describe('bounded trend generation', () => {
	it('loads one history set for 80 banks and checkpoints a resumable cursor', async () => {
		const banks = Array.from({ length: TREND_BANK_BATCH_SIZE }, (_, index) => ({ cert: index + 1 }));
		const history = banks.map(({ cert }) => ({
			cert,
			repdte: '20261231',
			asset_bucket: 3,
			roa: 1,
			roe: 2,
			nimy: 3,
			eeffr: 4,
			nclnlsr: 5,
			rbcrwaj: 6,
			lnlsdepr: 7,
			eqv: 8
		}));
		const prepared: Array<{ sql: string; params: unknown[] }> = [];
		const prepare = vi.fn((sql: string) => {
			const call = { sql, params: [] as unknown[] };
			prepared.push(call);
			const statement = {
				bind: (...params: unknown[]) => {
					call.params = params;
					return statement;
				},
				first: async () => null,
				all: async () => ({
					results: sql.includes('FROM institutions')
						? banks
						: sql.includes('ROW_NUMBER() OVER') ? history : []
				}),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const batch = vi.fn(async (_statements: D1PreparedStatement[]) => [] as D1Result[]);
		const db = Object.assign(Object.create(null) as D1Database, { prepare, batch });

		const result = await computeAllTrends(db, '20261231', {
			runId: 'trend-run-1',
			maxBatches: 1
		});

		expect(result).toMatchObject({
			processed: TREND_BANK_BATCH_SIZE,
			rows_inserted: TREND_BANK_BATCH_SIZE * 8,
			done: false,
			cursor: TREND_BANK_BATCH_SIZE
		});
		const historyQueries = prepared.filter(({ sql }) => sql.includes('ROW_NUMBER() OVER'));
		expect(historyQueries).toHaveLength(1);
		expect(historyQueries[0].params).toHaveLength(TREND_BANK_BATCH_SIZE + 1);
		expect(prepared.filter(({ sql }) => sql.includes('FROM json_each(?)'))).toHaveLength(4);
		const stateWrites = prepared.filter(({ sql }) => sql.includes('INSERT INTO pipeline_state'));
		expect(JSON.parse(String(stateWrites.at(-1)?.params[1]))).toMatchObject({
			runId: 'trend-run-1',
			status: 'running',
			cursor: TREND_BANK_BATCH_SIZE,
			banksProcessed: TREND_BANK_BATCH_SIZE
		});
		expect(batch).toHaveBeenCalledTimes(1);
		expect(batch.mock.calls[0]?.[0]).toHaveLength(4);
	});

	it('computes changes and moving averages from exact calendar-quarter windows', () => {
		const repdtes = [
			'20230331', '20230630', '20230930', '20231231',
			'20240331', '20240630', '20240930', '20241231'
		];
		const history = repdtes.map((repdte, index) => ({
			cert: 10,
			repdte,
			asset_bucket: 2,
			roa: index + 1
		}));

		const rows = buildTrendRowsForHistory(10, '20241231', history);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			metric: 'roa',
			repdte: '20241231',
			ma_4q: 6.5,
			ma_8q: 4.5,
			qoq_change: 1,
			yoy_change: 4,
			trend_slope: 1,
			peer_group: 'asset_bucket:2'
		});
	});

	it('does not compress missing rows or null metric values into QoQ or moving-average outputs', () => {
		const rows = buildTrendRowsForHistory(10, '20241231', [
			{ cert: 10, repdte: '20231231', asset_bucket: 2, roa: 1 },
			{ cert: 10, repdte: '20240331', asset_bucket: 2, roa: 2 },
			{ cert: 10, repdte: null, asset_bucket: 2, roa: 99 },
			{ cert: 10, repdte: '20240630', asset_bucket: 2, roa: 3 },
			{ cert: 10, repdte: '20240930', asset_bucket: 2, roa: null },
			{ cert: 10, repdte: '20241231', asset_bucket: 2, roa: 5 }
		]);

		expect(rows[0]).toMatchObject({
			repdte: '20241231',
			ma_4q: null,
			ma_8q: null,
			qoq_change: null,
			yoy_change: 4
		});
	});

	it('uses elapsed quarter distance for regression rather than compressing gaps', () => {
		const rows = buildTrendRowsForHistory(10, '20240930', [
			{ cert: 10, repdte: '20240331', asset_bucket: 2, roa: 1 },
			{ cert: 10, repdte: '20240930', asset_bucket: 2, roa: 3 }
		]);

		expect(rows[0]).toMatchObject({
			qoq_change: null,
			yoy_change: null,
			trend_slope: 1,
			trend_r_squared: 1
		});
	});

	it('keeps a stale observation on its actual reporting date', () => {
		const rows = buildTrendRowsForHistory(10, '20241231', [
			{ cert: 10, repdte: '20240630', asset_bucket: 2, roa: 1 },
			{ cert: 10, repdte: '20240930', asset_bucket: 2, roa: 2 }
		]);

		expect(rows[0]).toMatchObject({
			repdte: '20240930',
			qoq_change: 1,
			yoy_change: null,
			ma_4q: null,
			ma_8q: null
		});
	});

	it('does not publish a stale bank observation under the target release date', async () => {
		const banks = [{ cert: 10 }];
		const history = [{
			cert: 10,
			repdte: '20240930',
			asset_bucket: 2,
			roa: 1,
			roe: 2,
			nimy: 3,
			eeffr: 4,
			nclnlsr: 5,
			rbcrwaj: 6,
			lnlsdepr: 7,
			eqv: 8
		}];
		const prepared: Array<{ sql: string; params: unknown[] }> = [];
		const prepare = vi.fn((sql: string) => {
			const call = { sql, params: [] as unknown[] };
			prepared.push(call);
			const statement = {
				bind: (...params: unknown[]) => {
					call.params = params;
					return statement;
				},
				first: async () => sql.includes('COUNT(*) AS row_count') ? { row_count: 0 } : null,
				all: async () => ({
					results: sql.includes('FROM institutions')
						? banks
						: sql.includes('ROW_NUMBER() OVER') ? history : []
				}),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const db = Object.assign(Object.create(null) as D1Database, {
			prepare,
			batch: vi.fn(async () => [] as D1Result[])
		});

		await expect(computeAllTrends(db, '20241231', { runId: 'stale-bank' })).resolves.toMatchObject({
			processed: 1,
			rows_inserted: 0,
			done: true
		});
		expect(prepared.some(({ sql }) => sql.includes('FROM json_each(?)'))).toBe(false);
	});

	it('fails closed when the completed trend generation does not reconcile', async () => {
		const prepared: Array<{ sql: string; params: unknown[] }> = [];
		const prepare = vi.fn((sql: string) => {
			const call = { sql, params: [] as unknown[] };
			prepared.push(call);
			const statement = {
				bind: (...params: unknown[]) => {
					call.params = params;
					return statement;
				},
				first: async () => sql.includes('COUNT(*) AS row_count')
					? { row_count: 1 }
					: null,
				all: async () => ({ results: [] }),
				run: async () => ({ success: true, meta: { changes: 1 } })
			};
			return statement;
		});
		const db = Object.assign(Object.create(null) as D1Database, {
			prepare,
			batch: vi.fn(async () => [] as D1Result[])
		});

		await expect(computeAllTrends(db, '20261231', { runId: 'trend-run-2' }))
			.rejects.toThrow(/expected 0 rows, stored 1/);
		const stateWrites = prepared.filter(({ sql }) => sql.includes('INSERT INTO pipeline_state'));
		expect(stateWrites).toHaveLength(1);
		expect(JSON.parse(String(stateWrites[0].params[1]))).toMatchObject({ status: 'running' });
	});
});
