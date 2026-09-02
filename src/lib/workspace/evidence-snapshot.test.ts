import { describe, expect, it } from 'vitest';
import type { AnalysisProvenance, Financial, Institution } from '$lib/types';
import { createDefaultWorkspaceState } from './state';
import { buildWorkspaceEvidenceSnapshot } from './evidence-snapshot';
import type { WorkspaceBank } from '$lib/components/workspace/workspace-data';

const provenance: AnalysisProvenance = {
	source: 'FDIC BankFind Financials',
	source_url: 'https://api.fdic.gov/banks/docs/',
	source_as_of: '20260630',
	retrieved_at: '2026-08-30T12:00:00.000Z',
	release: '20260630',
	release_generation: 'generation-42',
	source_fields: { dep: ['DEP'], loanGrowth: ['LNLSNET'] },
	formulas: {
		dep: 'Reported FDIC field DEP',
		loanGrowth: '100 × (LNLSNET this quarter / LNLSNET four quarters earlier − 1)'
	},
	cohort_hash: 'cohort-42'
};

function financial(cert: number, repdte: string, dep: number | null, lnlsnet: number | null): Financial {
	return {
		cert,
		repdte,
		asset: null,
		dep,
		eq: null,
		lnlsnet,
		lnre: null,
		lnci: null,
		lncon: null,
		sec: null,
		netinc: null,
		intinc: null,
		eintexp: null,
		nim: null,
		nonii: null,
		nonix: null,
		elnatr: null,
		roa: null,
		roe: null,
		nimy: null,
		eeffr: null,
		rbcrwaj: null,
		rbc1rwaj: null,
		rbc1aaj: null,
		eqv: null,
		nclnlsr: null,
		lnatresr: null,
		nco_ratio: null,
		lnlsdepr: null,
		othbfhlb: null,
		numemp: null,
		asset_bucket: null
	};
}

function bank(cert: number, name: string, rows: Financial[]): WorkspaceBank {
	const institution: Institution = {
		cert,
		rssd_id: null,
		name,
		city: 'Boston',
		state: 'MA',
		zip: null,
		county: null,
		charter_class: null,
		regulator: 'FDIC',
		active: 1,
		established_date: null,
		insured_date: null,
		holding_company: null,
		hc_rssd_id: null,
		asset_tier: 4,
		total_assets: null,
		total_deposits: rows.at(-1)?.dep ?? null,
		num_branches: null,
		num_employees: null,
		latest_repdte: rows.at(-1)?.repdte ?? null,
		latest_roa: null,
		latest_roe: null,
		latest_nim: null,
		latest_npl_ratio: null,
		latest_tier1_ratio: null
	};
	return { ...institution, color: '#25cdf5', financials: rows };
}

describe('buildWorkspaceEvidenceSnapshot', () => {
	it('pins exact values, source rows, recipes, release lineage, and missingness', () => {
		const state = createDefaultWorkspaceState();
		state.selectedCerts = [1, 2];
		state.activeBank = 1;
		state.activeMetric = 'dep';
		const banks = [
			bank(1, 'Complete Bank', [
				financial(1, '20250630', 90, 80),
				financial(1, '20260630', 100, 100)
			]),
			bank(2, 'Sparse Bank', [financial(2, '20260630', null, 50)])
		];

		const snapshot = buildWorkspaceEvidenceSnapshot({
			state,
			banks,
			metrics: ['dep', 'loanGrowth'],
			periods: ['20260630'],
			provenance,
			sourceMode: 'live',
			exportedAt: '2026-09-01T12:00:00.000Z',
			liveWorkspaceUrl: 'https://bankgraph.example/workspace?wv=2&ws=state',
			cohort: {
				definition: { basis: 'screen' },
				definitionLabel: 'Current screen',
				definitionHash: 'definition-42',
				memberCerts: [1, 2],
				memberHash: 'cohort-42'
			}
		});

		expect(snapshot).toMatchObject({
			format: 'bankgraph_evidence_snapshot',
			version: 1,
			fixed_values: true,
			release: {
				mode: 'live',
				reporting_period: '20260630',
				generation: 'generation-42'
			},
			live_workspace: {
				behavior: 'replays_choices_against_current_published_data'
			},
			coverage: {
				selected_bank_count: 2,
				period_count: 1,
				metric_count: 2,
				observation_row_count: 2,
				complete_observation_rows: 1,
				empty_observation_rows: 1,
				expected_value_count: 4,
				available_value_count: 2,
				missing_value_count: 2,
				normalized_source_row_count: 3,
				by_metric: {
					dep: { available: 1, missing: 1 },
					loanGrowth: { available: 1, missing: 1 }
				}
			}
		});
		expect(snapshot.observations).toEqual([
			{ cert: 1, bank: 'Complete Bank', period: '20260630', values: { dep: 100, loanGrowth: 25 } },
			{ cert: 2, bank: 'Sparse Bank', period: '20260630', values: { dep: null, loanGrowth: null } }
		]);
		expect(snapshot.normalized_financial_rows.map((row) => [row.cert, row.repdte])).toEqual([
			[1, '20250630'],
			[1, '20260630'],
			[2, '20260630']
		]);
		expect(snapshot.calculation_recipes).toEqual({
			source_fields: provenance.source_fields,
			formulas: provenance.formulas
		});
	});

	it('clones the workspace so later edits do not change the exported snapshot', () => {
		const state = createDefaultWorkspaceState();
		state.question = 'Original question';
		const snapshot = buildWorkspaceEvidenceSnapshot({
			state,
			banks: [],
			metrics: [],
			periods: [],
			provenance,
			sourceMode: 'recorded',
			exportedAt: '2026-09-01T12:00:00.000Z',
			liveWorkspaceUrl: null,
			cohort: {
				definition: {},
				definitionLabel: 'No cohort',
				definitionHash: 'definition-empty',
				memberCerts: [],
				memberHash: 'cohort-empty'
			}
		});
		state.question = 'Changed later';
		expect(snapshot.workspace.question).toBe('Original question');
	});
});
