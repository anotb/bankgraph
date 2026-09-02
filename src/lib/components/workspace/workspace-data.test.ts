import { describe, expect, it } from 'vitest';
import recordedFixture from '../../../../demo/fixtures/fdic-demo.json';
import type { CompareResponse, Financial, Institution } from '$lib/types';
import { buildWorkspaceBanks, changeFromStart, formatMetric, quarterLabel, valueAt, valueAtPeriod } from './workspace-data';

function recordedWorkspace() {
	const institutions = recordedFixture.institutions as Institution[];
	const financials = recordedFixture.financials as Financial[];
	const data = Object.fromEntries(institutions.map((bank) => [
		bank.cert,
		financials.filter((row) => row.cert === bank.cert)
	]));
	return buildWorkspaceBanks(institutions, institutions.slice(0, 5), {
		certs: institutions.map((bank) => bank.cert),
		metrics: ['asset', 'dep', 'roa', 'nimy', 'lnlsnet', 'nclnlsr'],
		data,
		provenance: {
			source: 'FDIC BankFind Financials', source_url: 'https://api.fdic.gov/banks/docs/',
			source_as_of: '20260630', retrieved_at: null, release: null, release_generation: null,
			source_fields: {}, formulas: {}, cohort_hash: null
		}
	} satisfies CompareResponse);
}

describe('workspace data adapter', () => {
	it('uses the recorded rows without inventing a client-side demo', () => {
		const workspace = recordedWorkspace();
		expect(workspace.fallback).toBe(false);
		expect(workspace.cohort).toHaveLength(6);
		expect(workspace.selected).toHaveLength(5);
		expect(workspace.selected.every((bank) => bank.financials.length === 12)).toBe(true);
		expect(workspace.selected[0].financials.at(-1)?.repdte).toBe('20260630');
	});

	it('derives visible changes and loan growth from exact reporting rows', () => {
		const bank = recordedWorkspace().selected[0];
		const latestLoans = bank.financials.at(-1)?.lnlsnet;
		const yearAgoLoans = bank.financials.at(-5)?.lnlsnet;
		expect(valueAt(bank, 'loanGrowth')).toBeCloseTo(((latestLoans! / yearAgoLoans!) - 1) * 100, 10);
		expect(changeFromStart(bank, 'asset')).toBeCloseTo(((bank.financials.at(-1)!.asset! / bank.financials[0].asset!) - 1) * 100, 10);
	});

	it('formats periods and metric units consistently', () => {
		expect(quarterLabel('20260630')).toBe("Q2 '26");
		expect(formatMetric(4_091_315_000, 'asset')).toBe('$4.09T');
		expect(formatMetric(1.126, 'roa')).toBe('1.13%');
		expect(formatMetric(128_400, 'numemp')).toBe('128,400');
	});

	it('resolves the broader reported metric universe without changing the six-metric default', () => {
		const bank = recordedWorkspace().selected[0];
		const latest = bank.financials.at(-1)!;
		expect(valueAtPeriod(bank, 'roe', latest.repdte)).toBe(latest.roe);
		expect(valueAtPeriod(bank, 'rbc1rwaj', latest.repdte)).toBe(latest.rbc1rwaj);
		expect(valueAtPeriod(bank, 'lnlsdepr', latest.repdte)).toBe(latest.lnlsdepr);
		expect(valueAtPeriod(bank, 'numemp', latest.repdte)).toBe(latest.numemp);
	});

	it('uses single-quarter net income or an exact same-year YTD difference', () => {
		const bank = recordedWorkspace().selected[0];
		const rows = bank.financials.map((row, index) => ({
			...row,
			netincq: index === 2 ? 77 : null,
			netinc: row.repdte.endsWith('0331') ? 100 : row.repdte.endsWith('0630') ? 240 : row.netinc
		}));
		const subject = { ...bank, financials: rows };
		expect(valueAt(subject, 'netinc', 2)).toBe(77);
		const q2Index = rows.findIndex((row, index) => index > 0 && row.repdte.endsWith('0630'));
		expect(valueAt(subject, 'netinc', q2Index)).toBe(140);
	});

	it('matches values by reporting date when a bank has a missing quarter', () => {
		const bank = recordedWorkspace().selected[0];
		const missingPeriod = bank.financials[1].repdte;
		const retainedPeriod = bank.financials[2].repdte;
		const shortened = {
			...bank,
			financials: bank.financials.filter((row) => row.repdte !== missingPeriod)
		};
		expect(valueAtPeriod(shortened, 'asset', missingPeriod)).toBeNull();
		expect(valueAtPeriod(shortened, 'asset', retainedPeriod)).toBe(
			bank.financials[2].asset
		);
		const latest = bank.financials.at(-1)!;
		const yearAgo = `${Number(latest.repdte.slice(0, 4)) - 1}${latest.repdte.slice(4)}`;
		const withoutYearAgo = {
			...bank,
			financials: bank.financials.filter((row) => row.repdte !== yearAgo)
		};
		expect(valueAtPeriod(withoutYearAgo, 'loanGrowth', latest.repdte)).toBeNull();
	});
});
