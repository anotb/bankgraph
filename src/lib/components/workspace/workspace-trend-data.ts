import {
	valueAtPeriod,
	type WorkspaceBank,
	type WorkspaceMetric
} from './workspace-data';

export type TrendScale = 'value' | 'index';

export function trendValueAtPeriod(
	bank: WorkspaceBank,
	metric: WorkspaceMetric,
	period: string,
	dates: readonly string[],
	scale: TrendScale
): number | null {
	const raw = valueAtPeriod(bank, metric, period);
	if (raw === null || scale === 'value') return raw;
	const base = dates
		.map((date) => valueAtPeriod(bank, metric, date))
		.find((value): value is number => value !== null);
	return base === undefined || base === 0 ? null : (raw / base) * 100;
}

export function trendHistoryRows(
	banks: readonly WorkspaceBank[],
	metric: WorkspaceMetric,
	dates: readonly string[],
	scale: TrendScale
) {
	return dates.map((period) => ({
		period,
		values: banks.map((bank) => ({
			cert: bank.cert,
			value: trendValueAtPeriod(bank, metric, period, dates, scale)
		}))
	}));
}
