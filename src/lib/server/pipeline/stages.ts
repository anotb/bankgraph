export const PIPELINE_STAGES = [
	'institutions',
	'financials',
	'financials-latest',
	'failures',
	'snapshot',
	'analytics',
	'industry-history',
	'trends',
	'anomalies',
	'risk',
	'macro',
	'correlations',
	'coverage-audit',
	'fix-dates',
	'publish'
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export class PipelineStageError extends Error {}

/** Require one bounded stage; a single request must never run the full pipeline. */
export function parsePipelineStage(raw: string | null): PipelineStage {
	if (!raw) throw new PipelineStageError('stage is required');
	if (!PIPELINE_STAGES.includes(raw as PipelineStage)) {
		throw new PipelineStageError(`Unknown stage: ${raw}`);
	}
	return raw as PipelineStage;
}
