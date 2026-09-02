import { describe, expect, it } from 'vitest';
import { formatMetricTrend } from './metric-trend';

describe('formatMetricTrend', () => {
	it('formats balance-sheet growth as a percent change', () => {
		expect(formatMetricTrend(1.86)).toEqual({
			visual: '+1.86%',
			aria: 'Quarter-over-quarter change: +1.86 percent.'
		});
	});

	it('formats ratio movement in percentage points', () => {
		expect(formatMetricTrend(-0.04, 'percentage_points')).toEqual({
			visual: '-0.04 pp',
			aria: 'Quarter-over-quarter change: -0.04 percentage points.'
		});
	});
});
