export type MetricTrendUnit = 'percent' | 'percentage_points';

export interface FormattedMetricTrend {
	visual: string;
	aria: string;
}

/** Format a quarter-over-quarter change without conflating percent and percentage points. */
export function formatMetricTrend(
	trend: number,
	unit: MetricTrendUnit = 'percent'
): FormattedMetricTrend {
	const signedValue = `${trend > 0 ? '+' : ''}${trend.toFixed(2)}`;
	const visual = unit === 'percentage_points' ? `${signedValue} pp` : `${signedValue}%`;
	const spokenUnit = unit === 'percentage_points' ? 'percentage points' : 'percent';

	return {
		visual,
		aria: `Quarter-over-quarter change: ${signedValue} ${spokenUnit}.`
	};
}
