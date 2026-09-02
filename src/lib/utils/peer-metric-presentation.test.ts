import { describe, expect, it } from 'vitest';
import { peerMetricDirection, percentileBadgeClass } from './peer-metric-presentation';

describe('peer metric presentation', () => {
	it('keeps loan-to-deposit percentile position neutral', () => {
		expect(peerMetricDirection('lnlsdepr')).toBe('neutral');
		expect(percentileBadgeClass('lnlsdepr', 95)).toBe(
			'bg-[--accent-muted] text-[--accent-text]'
		);
		expect(percentileBadgeClass('lnlsdepr', 5)).toBe(
			'bg-[--accent-muted] text-[--accent-text]'
		);
	});

	it('defaults unclassified metrics to neutral presentation', () => {
		expect(peerMetricDirection('future_metric')).toBe('neutral');
	});

	it('preserves explicit direction for interpretable metrics', () => {
		expect(peerMetricDirection('roa')).toBe('higher');
		expect(peerMetricDirection('nclnlsr')).toBe('lower');
		expect(percentileBadgeClass('roa', 80)).toContain('positive');
		expect(percentileBadgeClass('nclnlsr', 80)).toContain('negative');
	});
});
