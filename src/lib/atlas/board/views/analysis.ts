import type { WorkspaceAnalysisResult } from '$lib/workspace/types';
import { createBrowserAnalysisResultRepository, type AnalysisResultRef, type AnalysisResultRepository } from '$lib/workspace/analysis-result-repository';

let repository: Promise<AnalysisResultRepository> | null = null;
const cache = new Map<string, WorkspaceAnalysisResult>();

/** Resolve a board block's analysis pointer: the live state first, then the content-addressed store. */
export async function resolveAnalysis(ref: AnalysisResultRef, live: WorkspaceAnalysisResult | null): Promise<WorkspaceAnalysisResult | null> {
	if (live && live.id === ref.resultId) return live;
	const hit = cache.get(ref.contentHash);
	if (hit) return hit;
	try {
		repository ??= createBrowserAnalysisResultRepository();
		const result = await (await repository).get(ref);
		if (result) cache.set(ref.contentHash, result);
		if (!result && live) return live;
		return result;
	} catch {
		return live;
	}
}
