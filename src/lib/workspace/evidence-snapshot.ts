import type { AnalysisProvenance, Financial, Institution } from '$lib/types';
import type { WorkspaceBank, WorkspaceMetric } from '$lib/components/workspace/workspace-data';
import { valueAtPeriod } from '$lib/components/workspace/workspace-data';
import { getWorkspaceComparisonPair } from './periods';
import type { WorkspaceState } from './types';

export const BANKGRAPH_EVIDENCE_SNAPSHOT_VERSION = 1 as const;

export interface EvidenceMetricCoverage {
	available: number;
	missing: number;
}

export interface WorkspaceEvidenceSnapshot {
	format: 'bankgraph_evidence_snapshot';
	version: typeof BANKGRAPH_EVIDENCE_SNAPSHOT_VERSION;
	exported_at: string;
	fixed_values: true;
	release: {
		mode: 'live' | 'recorded';
		reporting_period: string | null;
		generation: string | null;
		source_as_of: string | null;
		retrieved_at: string | null;
		source: string;
		source_url: string;
	};
	live_workspace: {
		url: string | null;
		behavior: 'replays_choices_against_current_published_data';
	};
	workspace: WorkspaceState;
	analysis: {
		selected_certs: number[];
		metrics: WorkspaceMetric[];
		periods: string[];
		active_bank: number | null;
		active_metric: string | null;
		comparison: ReturnType<typeof getWorkspaceComparisonPair>;
	};
	cohort: {
		definition: unknown;
		definition_label: string;
		definition_hash: string;
		member_certs: number[];
		member_hash: string;
	};
	provenance: AnalysisProvenance;
	calculation_recipes: {
		source_fields: Record<string, string[]>;
		formulas: Record<string, string>;
	};
	institutions: Institution[];
	observations: Array<{
		cert: number;
		bank: string;
		period: string;
		values: Record<string, number | null>;
	}>;
	/** Normalized rows returned by Bankgraph's release-fenced public data API. */
	normalized_financial_rows: Financial[];
	coverage: {
		selected_bank_count: number;
		period_count: number;
		metric_count: number;
		observation_row_count: number;
		complete_observation_rows: number;
		empty_observation_rows: number;
		expected_value_count: number;
		available_value_count: number;
		missing_value_count: number;
		normalized_source_row_count: number;
		by_metric: Record<string, EvidenceMetricCoverage>;
	};
}

export interface BuildWorkspaceEvidenceSnapshotInput {
	state: WorkspaceState;
	banks: WorkspaceBank[];
	metrics: WorkspaceMetric[];
	periods: string[];
	provenance: AnalysisProvenance;
	sourceMode: 'live' | 'recorded';
	exportedAt: string;
	liveWorkspaceUrl: string | null;
	cohort: {
		definition: unknown;
		definitionLabel: string;
		definitionHash: string;
		memberCerts: number[];
		memberHash: string;
	};
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function institutionFromWorkspaceBank(bank: WorkspaceBank): Institution {
	const { color: _color, financials: _financials, ...institution } = bank;
	return cloneJson(institution);
}

/**
 * Build a fixed, self-contained evidence file from values already loaded from one
 * published release. This is deliberately a download, not a server permalink.
 */
export function buildWorkspaceEvidenceSnapshot(
	input: BuildWorkspaceEvidenceSnapshotInput
): WorkspaceEvidenceSnapshot {
	const banks = [...new Map(input.banks.map((bank) => [bank.cert, bank])).values()];
	const metrics = [...new Set(input.metrics)];
	const periods = [...new Set(input.periods)].sort();
	const byMetric = Object.fromEntries(
		metrics.map((metric) => [metric, { available: 0, missing: 0 } satisfies EvidenceMetricCoverage])
	);
	let availableValueCount = 0;
	let completeObservationRows = 0;
	let emptyObservationRows = 0;

	const observations = banks.flatMap((bank) =>
		periods.map((period) => {
			const values = Object.fromEntries(
				metrics.map((metric) => {
					const value = valueAtPeriod(bank, metric, period);
					if (value === null) byMetric[metric].missing += 1;
					else {
						byMetric[metric].available += 1;
						availableValueCount += 1;
					}
					return [metric, value];
				})
			);
			const present = Object.values(values).filter((value) => value !== null).length;
			if (present === metrics.length) completeObservationRows += 1;
			if (present === 0) emptyObservationRows += 1;
			return { cert: bank.cert, bank: bank.name, period, values };
		})
	);
	const normalizedFinancialRows = banks
		.flatMap((bank) => bank.financials.map((row) => cloneJson(row)))
		.sort((left, right) => left.cert - right.cert || left.repdte.localeCompare(right.repdte));
	const expectedValueCount = banks.length * periods.length * metrics.length;

	return {
		format: 'bankgraph_evidence_snapshot',
		version: BANKGRAPH_EVIDENCE_SNAPSHOT_VERSION,
		exported_at: input.exportedAt,
		fixed_values: true,
		release: {
			mode: input.sourceMode,
			reporting_period: input.provenance.release,
			generation: input.provenance.release_generation,
			source_as_of: input.provenance.source_as_of,
			retrieved_at: input.provenance.retrieved_at,
			source: input.provenance.source,
			source_url: input.provenance.source_url
		},
		live_workspace: {
			url: input.liveWorkspaceUrl,
			behavior: 'replays_choices_against_current_published_data'
		},
		workspace: cloneJson(input.state),
		analysis: {
			selected_certs: banks.map((bank) => bank.cert),
			metrics,
			periods,
			active_bank: input.state.activeBank,
			active_metric: input.state.activeMetric,
			comparison: getWorkspaceComparisonPair(input.state)
		},
		cohort: {
			definition: cloneJson(input.cohort.definition),
			definition_label: input.cohort.definitionLabel,
			definition_hash: input.cohort.definitionHash,
			member_certs: [...input.cohort.memberCerts],
			member_hash: input.cohort.memberHash
		},
		provenance: cloneJson(input.provenance),
		calculation_recipes: {
			source_fields: cloneJson(input.provenance.source_fields),
			formulas: cloneJson(input.provenance.formulas)
		},
		institutions: banks.map(institutionFromWorkspaceBank),
		observations,
		normalized_financial_rows: normalizedFinancialRows,
		coverage: {
			selected_bank_count: banks.length,
			period_count: periods.length,
			metric_count: metrics.length,
			observation_row_count: observations.length,
			complete_observation_rows: completeObservationRows,
			empty_observation_rows: emptyObservationRows,
			expected_value_count: expectedValueCount,
			available_value_count: availableValueCount,
			missing_value_count: expectedValueCount - availableValueCount,
			normalized_source_row_count: normalizedFinancialRows.length,
			by_metric: byMetric
		}
	};
}
