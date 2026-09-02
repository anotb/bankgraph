import { describe, expect, it } from 'vitest';
import type { WorkspaceBank } from './workspace-data';
import { trendHistoryRows, trendValueAtPeriod } from './workspace-trend-data';

const dates = ['20250331', '20250630', '20250930'];
const bank = {
	cert: 101,
	name: 'Alpha Bank',
	color: '#25cdf5',
	financials: [
		{ cert: 101, repdte: dates[0], asset: 1_000_000 },
		{ cert: 101, repdte: dates[2], asset: 1_250_000 }
	]
} as WorkspaceBank;

describe('workspace trend data', () => {
	it('uses the same exact values for the chart and historical table', () => {
		const rows = trendHistoryRows([bank], 'asset', dates, 'value');
		expect(rows.map((row) => row.values[0].value)).toEqual([1_000_000, null, 1_250_000]);
		expect(trendValueAtPeriod(bank, 'asset', dates[2], dates, 'value')).toBe(
			rows[2].values[0].value
		);
	});

	it('indexes every observation to the first available value without filling gaps', () => {
		const rows = trendHistoryRows([bank], 'asset', dates, 'index');
		expect(rows.map((row) => row.values[0].value)).toEqual([100, null, 125]);
	});
});
