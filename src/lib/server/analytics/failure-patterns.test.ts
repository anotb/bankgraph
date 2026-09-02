import { describe, expect, it } from 'vitest';
import {
	FAILURE_HISTORY_SQL,
	FAILURE_PATTERN_FEATURES,
	FailurePatternInputError,
	buildActiveHistoryPlan,
	deriveFailurePattern,
	exactQuarterEnds,
	parseFailurePatternRequest,
	prepareExactActiveHistories,
	prepareExactFailureHistories,
	rankCurrentAnalogues,
	type ActiveHistoryRow,
	type ExactActiveHistory,
	type ExactFailureHistory,
	type FailureHistoryRow,
	type FailurePatternFinancialRow
} from './failure-patterns';

function financial(
	repdte: string,
	overrides: Partial<FailurePatternFinancialRow> = {}
): FailurePatternFinancialRow {
	return {
		cert: 100,
		repdte,
		asset: 1_000_000,
		dep: 800_000,
		lnlsnet: 600_000,
		lnre: 360_000,
		lnci: 120_000,
		lncon: 60_000,
		othbfhlb: 50_000,
		roa: 1,
		nimy: 3.5,
		nclnlsr: 1.2,
		nco_ratio: 0.4,
		rbcrwaj: 13,
		rbc1aaj: 9,
		lnlsdepr: 75,
		...overrides
	};
}

function failureRow(
	repdte: string,
	overrides: Partial<FailureHistoryRow> = {}
): FailureHistoryRow {
	return {
		...financial(repdte),
		source_id: 'failure-1',
		failure_cert: 100,
		failure_name: 'Failed Bank',
		failure_city: 'Example',
		failure_state: 'IL',
		fail_date: '20200415',
		anchor_repdte: '20200331',
		...overrides
	};
}

function activeRow(
	cert: number,
	repdte: string,
	overrides: Partial<ActiveHistoryRow> = {}
): ActiveHistoryRow {
	return {
		...financial(repdte, { cert }),
		name: `Bank ${cert}`,
		city: 'Example',
		state: 'NC',
		active: 1,
		...overrides
	};
}

describe('failure-pattern request bounds', () => {
	it('uses the launch-ready 2007–2012, eight-quarter defaults', () => {
		expect(parseFailurePatternRequest(new URLSearchParams())).toEqual({
			startYear: 2007,
			endYear: 2012,
			quarters: 8,
			limit: 25
		});
	});

	it.each([
		['quarters=13', 'quarters must be between 4 and 12'],
		['limit=101', 'limit must be between 1 and 100'],
		['start_year=2000&end_year=2020', 'failure-year span must not exceed 20 years'],
		['start_year=2012&end_year=2007', 'start_year must not exceed end_year'],
		['metric=roa', 'Unknown query parameter: metric'],
		['limit=10&limit=20', 'Duplicate query parameter: limit']
	])('rejects %s', (query, message) => {
		expect(() => parseFailurePatternRequest(new URLSearchParams(query))).toThrowError(
			new FailurePatternInputError(message)
		);
	});
});

describe('exact event windows', () => {
	it('walks exact FDIC quarter ends across years', () => {
		expect(exactQuarterEnds('20200331', 4)).toEqual([
			'20190630', '20190930', '20191231', '20200331'
		]);
	});

	it('anchors strictly before the failure date and removes lookahead rows', () => {
		const rows = [
			failureRow('20190930', { fail_date: '20200331' }),
			failureRow('20191231', { fail_date: '20200331' }),
			failureRow('20200331', { fail_date: '20200331' }),
			failureRow('20200630', { fail_date: '20200331' })
		];
		const histories = prepareExactFailureHistories(rows, 2);

		expect(histories).toHaveLength(1);
		expect(histories[0].anchorRepdte).toBe('20191231');
		expect(histories[0].rows.map((row) => row.repdte)).toEqual(['20190930', '20191231']);
		expect(histories[0].rows.every((row) => row.repdte < histories[0].failDate)).toBe(true);
	});

	it('excludes a history with a missing quarter instead of closing the gap', () => {
		const rows = [
			failureRow('20190331'),
			failureRow('20190930')
		];
		expect(prepareExactFailureHistories(rows, 3)).toEqual([]);
	});

	it('keeps only active banks with a complete window ending at the published release', () => {
		const dates = ['20190630', '20190930', '20191231', '20200331'];
		const rows = [
			...dates.map((date) => activeRow(10, date)),
			...dates.map((date) => activeRow(20, date, { active: 0 })),
			...dates.slice(1).map((date) => activeRow(30, date))
		];
		const histories = prepareExactActiveHistories(rows, 4, '20200331');

		expect(histories.map((history) => history.cert)).toEqual([10]);
		expect(histories[0].rows.map((row) => row.repdte)).toEqual(dates);
	});

	it('keeps null feature values missing and reports the event-time coverage', () => {
		const histories: ExactFailureHistory[] = [
			{
				sourceId: 'one', cert: 1, name: 'One', city: null, state: null,
				failDate: '20200415', anchorRepdte: '20200331', rows: [financial('20200331')]
			},
			{
				sourceId: 'two', cert: 2, name: 'Two', city: null, state: null,
				failDate: '20200416', anchorRepdte: '20200331', rows: [financial('20200331', { roa: null })]
			}
		];
		const roa = deriveFailurePattern(histories, 1).find((series) => series.metric === 'roa');

		expect(roa?.points[0]).toMatchObject({ count: 1, cohortCount: 2, coverage: 0.5, median: 1 });
	});
});

describe('descriptive analogue ranking', () => {
	const historical: ExactFailureHistory[] = [{
		sourceId: 'failure', cert: 1, name: 'Failed', city: null, state: null,
		failDate: '20200415', anchorRepdte: '20200331', rows: [financial('20200331')]
	}];

	it('uses deterministic feature-floor scales and certificate ties', () => {
		const pattern = deriveFailurePattern(historical, 1);
		const candidates: ExactActiveHistory[] = [20, 10].map((cert) => ({
			cert, name: `Bank ${cert}`, city: null, state: null, anchorRepdte: '20260630',
			rows: [financial('20260630', { cert })]
		}));
		const result = rankCurrentAnalogues(candidates, pattern, 10);

		expect(pattern.find((series) => series.metric === 'roa')?.points[0].referenceScaleMethod).toBe('feature_floor');
		expect(result.map((row) => row.cert)).toEqual([10, 20]);
		expect(result.map((row) => row.rank)).toEqual([1, 2]);
		expect(result.every((row) => row.distance === 0 && row.coverage.ratio === 1)).toBe(true);
	});

	it('reports missing cells and applies the declared coverage adjustment', () => {
		const pattern = deriveFailurePattern(historical, 1);
		const sparse: ExactActiveHistory = {
			cert: 10, name: 'Sparse Bank', city: null, state: null, anchorRepdte: '20260630',
			rows: [financial('20260630', { cert: 10, roa: null })]
		};
		const result = rankCurrentAnalogues([sparse], pattern, 1)[0];

		expect(result.coverage.missingBankCells).toBe(1);
		expect(result.coverage.observedCells).toBe(FAILURE_PATTERN_FEATURES.length - 1);
		expect(result.coverage.ratio).toBeLessThan(1);
		expect(result.featureContributions.find((entry) => entry.metric === 'roa')).toMatchObject({
			observedPeriods: 0,
			expectedPeriods: 1,
			coverage: 0,
			rmsStandardizedDistance: null
		});
		expect(result.coverageAdjustedDistance).toBeGreaterThanOrEqual(result.distance);
	});
});

describe('bounded D1 plans', () => {
	it('selects only true failures and anchors financials strictly before the failure date', () => {
		expect(FAILURE_HISTORY_SQL).toContain("transaction_type = 'FAILURE'");
		expect(FAILURE_HISTORY_SQL).toContain('financial.repdte < selected_failures.fail_date');
		expect(FAILURE_HISTORY_SQL).toContain('WHERE history_rank <= ?');
	});

	it('limits the current comparison to active institutions and a bounded history window', () => {
		const plan = buildActiveHistoryPlan('20200331', 4);
		expect(plan.sql).toContain('institution.active = 1');
		expect(plan.sql).toContain('financial.repdte IN (?, ?, ?, ?)');
		expect(plan.sql).not.toContain('ROW_NUMBER');
		expect(plan.params).toEqual(['20190630', '20190930', '20191231', '20200331']);
	});
});
