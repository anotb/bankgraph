import { setCacheDataVersion } from '$lib/server/cache';
import {
	finalizePublication,
	preparePublication,
	type PreparedPublication,
	type PublishedRelease
} from '$lib/server/release';

export interface PublicationResult extends PublishedRelease {
	generation: string;
	alreadyReady: boolean;
}

interface PublicationDependencies {
	prepare: (db: D1Database, runId: string, options: { coverageBucket: R2Bucket }) => Promise<PreparedPublication>;
	writeCacheGeneration: (cache: KVNamespace | undefined, generation: string) => Promise<boolean>;
	finalize: (db: D1Database, publication: PreparedPublication) => Promise<PublishedRelease>;
}

const DEFAULT_DEPENDENCIES: PublicationDependencies = {
	prepare: preparePublication,
	writeCacheGeneration: setCacheDataVersion,
	finalize: finalizePublication
};

/**
 * Publish in recoverable order: reserve in D1, write the best-effort KV pointer,
 * then atomically open the authoritative D1 gate. A retry reuses the pending
 * D1 generation, so failure at either boundary cannot expose mixed data.
 */
export async function coordinatePublication(
	db: D1Database,
	cache: KVNamespace,
	coverageBucket: R2Bucket,
	runId: string,
	dependencies: PublicationDependencies = DEFAULT_DEPENDENCIES
): Promise<PublicationResult> {
	const prepared = await dependencies.prepare(db, runId, { coverageBucket });
	const cacheGenerationUpdated = await dependencies.writeCacheGeneration(cache, prepared.generation);
	if (!cacheGenerationUpdated) throw new Error('Failed to update the published cache generation');
	const release = await dependencies.finalize(db, prepared);
	return {
		...release,
		generation: prepared.generation,
		alreadyReady: prepared.alreadyReady
	};
}
