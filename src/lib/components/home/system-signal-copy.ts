import type { SignalCoverage } from '$lib/server/analytics/system-signals';

function coveragePercent(available: number, population: number): string {
	if (population <= 0) return 'not available';
	return `${((available / population) * 100).toLocaleString('en-US', {
		maximumFractionDigits: 1
	})}%`;
}

/** Concise public label that keeps every coverage denominator visible. */
export function systemSignalCoverageLabel(coverage: SignalCoverage): string {
	return `${coverage.paired.toLocaleString('en-US')} paired institutions · `
		+ `${coverage.availableCurrent.toLocaleString('en-US')}/${coverage.populationCurrent.toLocaleString('en-US')} current `
		+ `(${coveragePercent(coverage.availableCurrent, coverage.populationCurrent)}) · `
		+ `${coverage.availablePrior.toLocaleString('en-US')}/${coverage.populationPrior.toLocaleString('en-US')} prior `
		+ `(${coveragePercent(coverage.availablePrior, coverage.populationPrior)})`;
}

export const NET_LOANS_QBP_RECONCILIATION =
	'Bankgraph sums FDIC LNLSNET for the exact institutions with a value in both quarters. The FDIC Quarterly Banking Profile can report a different total-loan change because its loan definition and reporting population differ.';
