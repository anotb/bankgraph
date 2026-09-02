import type { RequestHandler } from './$types';
import { getDB, queryOne } from '$lib/server/db';
import { readCacheDataVersion } from '$lib/server/cache';
import { logError, logWarn } from '$lib/server/observability';
import {
	allBindingsReady,
	bindingStatus,
	liveDataDegradedReason
} from '$lib/server/readiness';
import {
	readPersistedReleaseReadiness,
	REQUIRED_SCHEMA_VERSION
} from '$lib/server/release';

function readinessResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
}

export const GET: RequestHandler = async ({ platform }) => {
	const bindings = bindingStatus(platform?.env);
	if (!allBindingsReady(bindings)) {
		logWarn('readiness_degraded', { reason: 'missing_bindings' });
		return readinessResponse({
			status: 'degraded',
			ready: false,
			liveData: { state: 'unavailable', reason: 'missing_bindings' },
			checks: { bindings }
		}, 503);
	}

	try {
		const db = getDB(platform);
		const schema = await queryOne<{ value: string }>(
			db,
			'SELECT value FROM pipeline_state WHERE key = ?',
			['schema_version']
		);
		const migrationsReady = schema?.value === REQUIRED_SCHEMA_VERSION;
		if (!migrationsReady) {
			logWarn('readiness_degraded', { reason: 'migration_incomplete' });
			return readinessResponse({
				status: 'degraded',
				ready: false,
				liveData: { state: 'degraded', reason: 'migration_incomplete', release: null },
				checks: {
					bindings,
					migrations: {
						ready: false,
						required: REQUIRED_SCHEMA_VERSION,
						applied: schema?.value ?? null
					}
				}
			}, 503);
		}

		const [persisted, cacheVersion] = await Promise.all([
			readPersistedReleaseReadiness(db),
			readCacheDataVersion(platform?.env?.CACHE)
		]);
		const publicationState = persisted.publication;
		const publishedRelease = persisted.publishedRelease;
		const releaseAttestation = persisted.attestation;
		const datasetIssues = persisted.issues.filter(
			(issue) => issue !== 'schema_version_mismatch' && issue !== 'publication_gate_closed'
		);
		const datasetsReady = datasetIssues.length === 0;
		const d1PublicationReady = persisted.ready;
		const cacheReady = d1PublicationReady
			&& cacheVersion === publicationState?.generation;
		const effectivePublicationState = publicationState?.state === 'refreshing'
			? 'refreshing'
			: d1PublicationReady
				? 'ready'
				: publicationState?.state === 'unpublished'
					? 'unpublished'
					: null;
		const reason = liveDataDegradedReason({
			migrationsReady,
			datasetsReady,
			publicationState: effectivePublicationState,
			cacheReady
		});
		const ready = reason === null;
		if (!ready) {
			logWarn('readiness_degraded', {
				reason,
				published_release: publishedRelease?.repdte ?? null,
				cache_generation: cacheVersion,
				publication_state: publicationState?.state ?? null,
				attestation_issues: persisted.issues.join(',')
			});
		}

		return readinessResponse({
			status: ready ? 'ready' : 'degraded',
			ready,
			liveData: {
				state: ready ? 'live' : 'degraded',
				reason,
				release: publishedRelease?.repdte ?? null
			},
			checks: {
				bindings,
				migrations: {
					ready: migrationsReady,
					required: REQUIRED_SCHEMA_VERSION,
					applied: schema?.value ?? null
				},
				publishedRelease: {
					ready: datasetsReady,
					repdte: publishedRelease?.repdte ?? null,
					publishedAt: publishedRelease?.publishedAt ?? null,
					latestFinancialQuarter: releaseAttestation?.release ?? null,
					financialHistoryStart: releaseAttestation?.financialHistoryStart ?? null,
					financialRowCount: releaseAttestation?.financialRowCount ?? 0,
					coverageRunId: releaseAttestation?.runId ?? null,
					coverageManifestSha256: releaseAttestation?.coverageManifestSha256 ?? null,
					coverageItemCount: releaseAttestation?.coverageItemCount ?? 0,
					attestedAt: releaseAttestation?.attestedAt ?? null,
					attestationIssues: datasetIssues,
					staleDatasets: datasetIssues,
					activePartitions: [],
					partitionIssues: []
				},
				cacheGeneration: {
					ready: cacheReady,
					expected: publicationState?.generation ?? null,
					actual: cacheVersion
				},
				publicationState: {
					ready: d1PublicationReady,
					state: publicationState?.state ?? null,
					release: publicationState?.release ?? null,
					generation: publicationState?.generation ?? null,
					pendingRelease: publicationState?.pendingRelease ?? null,
					pendingGeneration: publicationState?.pendingGeneration ?? null,
					updatedAt: publicationState?.updatedAt ?? null
				}
			}
		}, ready ? 200 : 503);
	} catch (error) {
		logError('readiness_database_unavailable', {
			error: error instanceof Error ? error.message : 'Unknown error'
		});
		return readinessResponse({
			status: 'degraded',
			ready: false,
			liveData: { state: 'unavailable', reason: 'database_unavailable' },
			checks: {
				bindings,
				database: { ready: false }
			}
		}, 503);
	}
};
