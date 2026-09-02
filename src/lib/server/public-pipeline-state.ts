import { queryAll } from '$lib/server/db';
import type { PipelineState } from '$lib/types';

/** Coordination keys are private and must not perturb a published response. */
export async function loadPublicPipelineState(db: D1Database): Promise<PipelineState[]> {
	return queryAll<PipelineState>(
		db,
		"SELECT key, value, updated_at FROM pipeline_state WHERE key NOT GLOB 'pipeline:*'"
	);
}
