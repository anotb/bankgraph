import { describe, expect, it } from 'vitest';
import {
	evidenceTrendTooltipPlacement,
	nextEvidenceTrendIndex
} from './evidence-trend-interaction';

describe('EvidenceTrend interaction', () => {
	it('moves through points in constant time and stops at the collection boundaries', () => {
		expect(nextEvidenceTrendIndex(4, 8, 'ArrowLeft')).toBe(3);
		expect(nextEvidenceTrendIndex(4, 8, 'ArrowRight')).toBe(5);
		expect(nextEvidenceTrendIndex(0, 8, 'ArrowLeft')).toBe(0);
		expect(nextEvidenceTrendIndex(7, 8, 'ArrowRight')).toBe(7);
		expect(nextEvidenceTrendIndex(4, 8, 'Home')).toBe(0);
		expect(nextEvidenceTrendIndex(4, 8, 'End')).toBe(7);
		expect(nextEvidenceTrendIndex(4, 8, 'Enter')).toBeNull();
	});

	it('keeps the tooltip inside each chart edge and away from the selected point', () => {
		expect(evidenceTrendTooltipPlacement(10, 10, 520, 104)).toEqual({
			horizontal: 'start',
			vertical: 'below'
		});
		expect(evidenceTrendTooltipPlacement(510, 94, 520, 104)).toEqual({
			horizontal: 'end',
			vertical: 'above'
		});
		expect(evidenceTrendTooltipPlacement(260, 52, 520, 104)).toEqual({
			horizontal: 'center',
			vertical: 'above'
		});
	});
});
