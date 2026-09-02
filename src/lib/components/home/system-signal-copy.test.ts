import { describe, expect, it } from 'vitest';
import {
	NET_LOANS_QBP_RECONCILIATION,
	systemSignalCoverageLabel
} from './system-signal-copy';

describe('public system-signal copy', () => {
	it('names the matched population and both coverage fractions', () => {
		expect(systemSignalCoverageLabel({
			populationCurrent: 4_228,
			populationPrior: 4_230,
			availableCurrent: 4_216,
			availablePrior: 4_220,
			paired: 4_204,
			ratio: 4_216 / 4_228,
			minimumCohortSize: null,
			status: 'complete'
		})).toBe(
			'4,204 paired institutions · 4,216/4,228 current (99.7%) · 4,220/4,230 prior (99.8%)'
		);
	});

	it('explains QBP reconciliation through definitions and population, not a fleeting number', () => {
		expect(NET_LOANS_QBP_RECONCILIATION).toContain('FDIC LNLSNET');
		expect(NET_LOANS_QBP_RECONCILIATION).toContain('definition and reporting population differ');
		expect(NET_LOANS_QBP_RECONCILIATION).not.toMatch(/\$|\d+\.\d+/);
	});
});
