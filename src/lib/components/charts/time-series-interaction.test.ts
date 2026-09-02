import { describe, expect, it } from 'vitest';
import {
	buildTimeSeriesTooltipHtml,
	formatExactChartDate,
	interactiveReportingDates,
	normalizeChartDate,
	TIME_SERIES_TOOLTIP_INTERACTION,
	timeSeriesTooltipPosition,
	type EChartsTooltipPoint,
	type TooltipSeriesMeta
} from './time-series-interaction';

describe('time-series tooltip interaction', () => {
	it('uses a bounded pointer and supports hover, tap, and axis inspection', () => {
		expect(TIME_SERIES_TOOLTIP_INTERACTION).toMatchObject({
			trigger: 'axis',
			triggerOn: 'mousemove|click',
			confine: true,
			enterable: true,
			transitionDuration: 0,
			axisPointer: { type: 'line', snap: true }
		});
	});

	it('shows an exact date, every series label, formatted values, and dual-axis units', () => {
		const params: EChartsTooltipPoint[] = [
			{
				seriesIndex: 0,
				seriesName: 'Fed Funds Rate',
				value: ['2026-06-30', 4.375],
				color: '#25cdf5'
			},
			{
				seriesIndex: 1,
				seriesName: 'Example Bank assets',
				value: ['2026-06-30', 2_500_000],
				color: '#ff875a'
			}
		];
		const metadata = new Map<number, TooltipSeriesMeta>([
			[0, { axisIndex: 0 }],
			[1, { axisIndex: 1, unit: 'USD' }]
		]);
		const html = buildTimeSeriesTooltipHtml(
			params,
			metadata,
			(value, axis) => (axis === 0 ? `${value.toFixed(2)}%` : `$${(value / 1_000_000).toFixed(1)}B`),
			'#93a8b1'
		);

		expect(html).toContain('June 30, 2026');
		expect(html).toContain('Fed Funds Rate');
		expect(html).toContain('4.38%');
		expect(html).toContain('Example Bank assets');
		expect(html).toContain('$2.5B');
		expect(html).toContain('USD');
	});

	it('omits null series without losing other observations and escapes labels and units', () => {
		const html = buildTimeSeriesTooltipHtml(
			[
				{ seriesIndex: 0, seriesName: 'Missing', value: ['20260331', null] },
				{
					seriesIndex: 1,
					seriesName: '<img onerror=alert(1)>',
					value: ['20260331', 51],
					color: 'red;position:fixed'
				}
			],
			new Map([[1, { axisIndex: 0, unit: '<script>' }]]),
			(value) => `P${value}`,
			'#93a8b1'
		);

		expect(html).not.toContain('Missing');
		expect(html).toContain('&lt;img onerror=alert(1)&gt;');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('position:fixed');
	});

	it('normalizes dates in UTC and offers only real observations to keyboard users', () => {
		expect(normalizeChartDate('20260331')).toBe('2026-03-31');
		expect(formatExactChartDate('03/31/2026')).toBe('March 31, 2026');
		expect(
			interactiveReportingDates([
				{
					data: [
						{ date: '20260331', value: 1 },
						{ date: '20260630', value: null }
					]
				},
				{ data: [{ date: '2026-09-30', value: 2 }] }
			])
		).toEqual(['2026-03-31', '2026-09-30']);
	});

	it('flips and clamps the readout instead of covering the selected edge', () => {
		expect(timeSeriesTooltipPosition([290, 90], [120, 70], [320, 180])).toEqual([156, 55]);
		expect(timeSeriesTooltipPosition([5, 5], [120, 70], [320, 180])).toEqual([19, 8]);
		expect(timeSeriesTooltipPosition([150, 90], [500, 500], [320, 180])).toEqual([8, 8]);
	});
});
