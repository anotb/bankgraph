import { queryAll, queryOne } from '$lib/server/db';
import { MACRO_SERIES_BY_ID } from '$lib/server/pipeline/macro-sources';
import {
	CANONICAL_FINANCIAL_SCOPE,
	CANONICAL_FINANCIAL_START,
	FINANCIAL_SYNC_RECONCILED_TOTAL_KEY,
	FINANCIAL_SYNC_SCOPE_KEY,
	FINANCIAL_SYNC_SOURCE_TOTAL_KEY,
	FINANCIAL_SYNC_STATUS_KEY
} from '$lib/server/pipeline/fdic-financials';
import { verifyStoredFDICCoverageManifest } from '$lib/server/pipeline/fdic-coverage-audit';
import { readPublicationControl } from '$lib/server/publication-barrier';

export const REQUIRED_SCHEMA_VERSION = '0024';
export const PUBLISHED_RELEASE_KEY = 'published_release';
export const PUBLISHED_COVERAGE_RUN_KEY = 'published_coverage_run';
export const PUBLISHED_COVERAGE_MANIFEST_KEY = 'published_coverage_manifest';
const REPORTING_DATE = /^\d{8}$/;

/**
 * Readiness deliberately executes this one bounded query. Every join is a
 * singleton or primary-key lookup; the expensive live-table verification is
 * performed once by preparePublication and persisted by finalizePublication.
 */
export const PERSISTED_RELEASE_READINESS_SQL = `
	SELECT control.state, control.release, control.generation,
	       control.pending_release, control.pending_generation,
	       control.pending_run_id, control.updated_at,
	       schema_state.value AS schema_version,
	       published.value AS published_release,
	       published.updated_at AS published_at,
	       coverage_run.value AS published_coverage_run_id,
	       coverage_hash.value AS published_coverage_manifest_sha256,
	       attestation.release AS attested_release,
	       attestation.generation AS attested_generation,
	       attestation.run_id AS attested_run_id,
	       attestation.schema_version AS attested_schema_version,
	       attestation.coverage_manifest_sha256 AS attested_coverage_manifest_sha256,
	       attestation.coverage_item_count AS attested_coverage_item_count,
	       attestation.financial_history_start AS attested_financial_history_start,
	       attestation.financial_row_count AS attested_financial_row_count,
	       attestation.attested_at,
	       manifest.manifest_sha256 AS stored_coverage_manifest_sha256,
	       manifest.item_count AS stored_coverage_item_count
	FROM release_control AS control
	LEFT JOIN pipeline_state AS schema_state ON schema_state.key = 'schema_version'
	LEFT JOIN pipeline_state AS published ON published.key = 'published_release'
	LEFT JOIN pipeline_state AS coverage_run ON coverage_run.key = 'published_coverage_run'
	LEFT JOIN pipeline_state AS coverage_hash ON coverage_hash.key = 'published_coverage_manifest'
	LEFT JOIN release_attestations AS attestation
	  ON attestation.generation = control.generation
	LEFT JOIN fdic_coverage_manifests AS manifest
	  ON manifest.run_id = attestation.run_id
	WHERE control.singleton = 1`;

const REQUIRED_RUN_STAGES = [
	'institutions',
	'failures',
	'snapshot',
	'analytics',
	'industry-history',
	'trends',
	'anomalies',
	'risk',
	'correlations'
] as const;

export interface PublishedRelease {
	repdte: string;
	publishedAt: string;
}

export interface PreparedPublication extends PublishedRelease {
	generation: string;
	runId: string;
	coverageManifestSha256: string;
	coverageItemCount: number;
	financialHistoryStart: string;
	financialRowCount: number;
	alreadyReady: boolean;
}

export interface ReleaseAttestation {
	release: string;
	generation: string;
	runId: string;
	schemaVersion: string;
	coverageManifestSha256: string;
	coverageItemCount: number;
	financialHistoryStart: string;
	financialRowCount: number;
	attestedAt: string;
}

export interface PersistedReleaseReadiness {
	publication: {
		state: 'unpublished' | 'refreshing' | 'ready';
		release: string | null;
		generation: string | null;
		pendingRelease: string | null;
		pendingGeneration: string | null;
		pendingRunId: string | null;
		updatedAt: string;
	} | null;
	schemaVersion: string | null;
	publishedRelease: PublishedRelease | null;
	publishedCoverageRunId: string | null;
	publishedCoverageManifestSha256: string | null;
	attestation: ReleaseAttestation | null;
	issues: string[];
	ready: boolean;
}

interface PersistedReleaseReadinessRow {
	state: 'unpublished' | 'refreshing' | 'ready';
	release: string | null;
	generation: string | null;
	pending_release: string | null;
	pending_generation: string | null;
	pending_run_id: string | null;
	updated_at: string;
	schema_version: string | null;
	published_release: string | null;
	published_at: string | null;
	published_coverage_run_id: string | null;
	published_coverage_manifest_sha256: string | null;
	attested_release: string | null;
	attested_generation: string | null;
	attested_run_id: string | null;
	attested_schema_version: string | null;
	attested_coverage_manifest_sha256: string | null;
	attested_coverage_item_count: number | null;
	attested_financial_history_start: string | null;
	attested_financial_row_count: number | null;
	attested_at: string | null;
	stored_coverage_manifest_sha256: string | null;
	stored_coverage_item_count: number | null;
}

export interface ReleaseCheck {
	latestFinancialQuarter: string | null;
	financialHistoryStart: string | null;
	financialRowCount: number;
	staleDatasets: string[];
	activePartitions: string[];
	partitionIssues: string[];
}

export interface PipelineRunCheck {
	ready: boolean;
	missing: string[];
}

/**
 * Verify the atomically published release attestation without touching any
 * fact table, coverage item table, or ingest ledger. Public views stay pinned
 * to the elected release while a newer candidate is built, and direct
 * maintenance closes the gate. The ready gate plus this immutable attestation
 * is therefore the authoritative O(1) health check between publications.
 */
export async function readPersistedReleaseReadiness(
	db: D1Database
): Promise<PersistedReleaseReadiness> {
	const row = await db.prepare(PERSISTED_RELEASE_READINESS_SQL)
		.first<PersistedReleaseReadinessRow>();
	if (!row) {
		return {
			publication: null,
			schemaVersion: null,
			publishedRelease: null,
			publishedCoverageRunId: null,
			publishedCoverageManifestSha256: null,
			attestation: null,
			issues: ['publication_control_missing'],
			ready: false
		};
	}

	const publication = {
		state: row.state,
		release: row.release,
		generation: row.generation,
		pendingRelease: row.pending_release,
		pendingGeneration: row.pending_generation,
		pendingRunId: row.pending_run_id,
		updatedAt: row.updated_at
	};
	const publishedRelease = row.published_release && row.published_at
		&& REPORTING_DATE.test(row.published_release)
		? { repdte: row.published_release, publishedAt: row.published_at }
		: null;
	const attestation = row.attested_release
		&& row.attested_generation
		&& row.attested_run_id
		&& row.attested_schema_version
		&& row.attested_coverage_manifest_sha256
		&& row.attested_coverage_item_count !== null
		&& row.attested_financial_history_start
		&& row.attested_financial_row_count !== null
		&& row.attested_at
		? {
			release: row.attested_release,
			generation: row.attested_generation,
			runId: row.attested_run_id,
			schemaVersion: row.attested_schema_version,
			coverageManifestSha256: row.attested_coverage_manifest_sha256,
			coverageItemCount: row.attested_coverage_item_count,
			financialHistoryStart: row.attested_financial_history_start,
			financialRowCount: row.attested_financial_row_count,
			attestedAt: row.attested_at
		}
		: null;
	const issues: string[] = [];
	if (row.schema_version !== REQUIRED_SCHEMA_VERSION) issues.push('schema_version_mismatch');
	if (!publishedRelease) issues.push('published_release_marker_invalid');
	if (!attestation) issues.push('release_attestation_missing');
	if (publication.state !== 'ready') issues.push('publication_gate_closed');
	if (!publication.release || !publication.generation
		|| publishedRelease?.repdte !== publication.release) {
		issues.push('published_release_control_mismatch');
	}
	if (attestation) {
		if (attestation.release !== publication.release
			|| attestation.generation !== publication.generation
			|| attestation.schemaVersion !== REQUIRED_SCHEMA_VERSION
			|| attestation.attestedAt !== publishedRelease?.publishedAt) {
			issues.push('release_attestation_control_mismatch');
		}
		if (row.published_coverage_run_id !== attestation.runId
			|| row.published_coverage_manifest_sha256 !== attestation.coverageManifestSha256) {
			issues.push('published_coverage_marker_mismatch');
		}
		if (row.stored_coverage_manifest_sha256 !== attestation.coverageManifestSha256
			|| row.stored_coverage_item_count !== attestation.coverageItemCount) {
			issues.push('stored_coverage_manifest_mismatch');
		}
		if (attestation.financialHistoryStart !== CANONICAL_FINANCIAL_START
			|| attestation.financialRowCount <= 0) {
			issues.push('canonical_financial_attestation_invalid');
		}
	}

	return {
		publication,
		schemaVersion: row.schema_version,
		publishedRelease,
		publishedCoverageRunId: row.published_coverage_run_id,
		publishedCoverageManifestSha256: row.published_coverage_manifest_sha256,
		attestation,
		issues,
		ready: issues.length === 0
	};
}

export async function readPublishedRelease(db: D1Database): Promise<PublishedRelease | null> {
	const row = await queryOne<{ value: string; updated_at: string }>(
		db,
		'SELECT value, updated_at FROM pipeline_state WHERE key = ?',
		[PUBLISHED_RELEASE_KEY]
	);
	if (!row || !REPORTING_DATE.test(row.value)) return null;
	return { repdte: row.value, publishedAt: row.updated_at };
}

/** Confirm every quarter-based public dataset reached the same source quarter. */
export async function checkReleaseCandidates(
	db: D1Database,
	options: { coverageRunId?: string } = {}
): Promise<ReleaseCheck> {
	// Keep these release-gate reads explicit and sequential. Production D1 can
	// reject even this small set when it is expressed as one compound SELECT.
	const candidateSources = [
		{ label: 'financials', sql: 'SELECT MAX(repdte) AS repdte FROM financials' },
		{ label: 'institution snapshot', sql: 'SELECT MAX(latest_repdte) AS repdte FROM institutions' },
		{ label: 'peer statistics', sql: 'SELECT MAX(repdte) AS repdte FROM peer_stats' },
		{ label: 'industry aggregates', sql: 'SELECT MAX(repdte) AS repdte FROM agg_industry' },
		{ label: 'trends', sql: 'SELECT MAX(repdte) AS repdte FROM bank_trends' },
		{ label: 'risk scores', sql: 'SELECT MAX(repdte) AS repdte FROM risk_scores' }
	] as const;
	const rows: Array<{ label: string; repdte: string | null }> = [];
	for (const source of candidateSources) {
		const row = await queryOne<{ repdte: string | null }>(db, source.sql);
		rows.push({ label: source.label, repdte: row?.repdte ?? null });
	}
	const financialHistory = await queryOne<{ repdte: string | null; row_count: number }>(
			db,
			'SELECT MIN(repdte) AS repdte, COUNT(*) AS row_count FROM financials'
		);
	const coverageState = await queryAll<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM pipeline_state WHERE key IN (?, ?, ?, ?)`,
			[
				FINANCIAL_SYNC_SCOPE_KEY,
				FINANCIAL_SYNC_STATUS_KEY,
				FINANCIAL_SYNC_SOURCE_TOTAL_KEY,
				FINANCIAL_SYNC_RECONCILED_TOTAL_KEY
			]
		);
	const activeRows = await queryAll<{ dataset: string; partition_key: string; status: string }>(
			db,
			`SELECT dataset, partition_key, status
			 FROM fdic_ingest_partitions
			 WHERE status IN ('running', 'reconciling')
			 ORDER BY dataset, partition_key`
		);
	const activeRuns = await queryAll<{ dataset: string; partition_key: string; status: string }>(
			db,
			`SELECT dataset, partition_key, status
			 FROM fdic_ingest_runs
			 WHERE status IN ('running', 'reconciling')
			 ORDER BY dataset, partition_key`
		);
	const badPublications = await queryAll<{ dataset: string; partition_key: string; reason: string }>(
			db,
			`SELECT publication.dataset, publication.partition_key,
			        CASE
			          WHEN run.run_id IS NULL THEN 'missing-run'
			          WHEN run.status <> 'complete' THEN 'run-' || run.status
			          ELSE 'row-count-mismatch'
			        END AS reason
			 FROM fdic_dataset_publications AS publication
			 LEFT JOIN fdic_ingest_runs AS run ON run.run_id = publication.run_id
			 WHERE publication.source_total <> publication.row_count
			    OR run.run_id IS NULL OR run.status <> 'complete'
			 ORDER BY publication.dataset, publication.partition_key`
		);
	const publishedCoverage = await queryAll<{ key: string; value: string }>(
			db,
			`SELECT key, value FROM pipeline_state WHERE key IN (?, ?)`,
			[PUBLISHED_COVERAGE_RUN_KEY, PUBLISHED_COVERAGE_MANIFEST_KEY]
		);

	const latestFinancialQuarter = rows.find((row) => row.label === 'financials')?.repdte ?? null;
	const staleDatasets = !latestFinancialQuarter
		? rows.map((row) => row.label)
		: rows.filter((row) => row.repdte !== latestFinancialQuarter).map((row) => row.label);
	const coverage = new Map(coverageState.map((row) => [row.key, row.value]));
	const sourceTotal = Number(coverage.get(FINANCIAL_SYNC_SOURCE_TOTAL_KEY));
	const reconciledTotal = Number(coverage.get(FINANCIAL_SYNC_RECONCILED_TOTAL_KEY));
	const legacyCoverageReady = coverage.get(FINANCIAL_SYNC_SCOPE_KEY) === CANONICAL_FINANCIAL_SCOPE
		&& coverage.get(FINANCIAL_SYNC_STATUS_KEY) === 'complete'
		&& Number.isSafeInteger(sourceTotal)
		&& sourceTotal > 0
		&& reconciledTotal === sourceTotal
		&& financialHistory?.row_count === sourceTotal;
	if (financialHistory?.repdte !== CANONICAL_FINANCIAL_START) {
		staleDatasets.push(`financial history must start at ${CANONICAL_FINANCIAL_START}`);
	}
	if (!legacyCoverageReady) {
		staleDatasets.push('canonical financial history coverage');
	}
	const published = new Map(publishedCoverage.map((row) => [row.key, row.value]));
	const coverageRunId = options.coverageRunId ?? published.get(PUBLISHED_COVERAGE_RUN_KEY);
	if (!coverageRunId) {
		staleDatasets.push('extended FDIC coverage manifest');
	} else {
		try {
			const manifest = await verifyStoredFDICCoverageManifest(db, coverageRunId);
			if (!options.coverageRunId
				&& published.get(PUBLISHED_COVERAGE_MANIFEST_KEY) !== manifest.manifest_sha256) {
				staleDatasets.push('published extended FDIC coverage manifest changed');
			}
		} catch {
			staleDatasets.push('extended FDIC coverage manifest is incomplete or stale');
		}
	}
	return {
		latestFinancialQuarter,
		financialHistoryStart: financialHistory?.repdte ?? null,
		financialRowCount: financialHistory?.row_count ?? 0,
		staleDatasets,
		activePartitions: [
			...activeRows.map((row) => `partition:${row.dataset}:${row.partition_key}:${row.status}`),
			...activeRuns.map((row) => `run:${row.dataset}:${row.partition_key}:${row.status}`)
		],
		partitionIssues: badPublications.map(
			(row) => `${row.dataset}:${row.partition_key}:${row.reason}`
		)
	};
}

/** Require every strict stage, including every allowlisted macro series, in one run. */
export async function checkPipelineRunComplete(
	db: D1Database,
	runId: string
): Promise<PipelineRunCheck> {
	const rows = await queryAll<{ stage: string; scope: string }>(
		db,
		'SELECT stage, scope FROM pipeline_run_stages WHERE run_id = ?',
		[runId]
	);
	const completed = new Set(rows.map((row) => `${row.stage}:${row.scope}`));
	const stages = new Set(rows.map((row) => row.stage));
	const missing = REQUIRED_RUN_STAGES
		.filter((stage) => !stages.has(stage))
		.map((stage) => `stage:${stage}`);
	if (!stages.has('financials') && !stages.has('financials-latest')) {
		missing.push('stage:financials-or-financials-latest');
	}
	const coverageManifest = await queryOne<{ manifest_sha256: string }>(
		db,
		'SELECT manifest_sha256 FROM fdic_coverage_manifests WHERE run_id = ?',
		[runId]
	);
	if (!coverageManifest) {
		missing.push('stage:coverage-audit');
	} else if (!completed.has(`coverage-audit:${coverageManifest.manifest_sha256}`)) {
		missing.push(`coverage-audit:${coverageManifest.manifest_sha256}`);
	}
	for (const seriesId of MACRO_SERIES_BY_ID.keys()) {
		if (!completed.has(`macro:${seriesId}`)) missing.push(`macro:${seriesId}`);
	}
	return { ready: missing.length === 0, missing };
}

/**
 * Validate a run and reserve one stable cache generation. A failed KV write
 * leaves the pending generation in D1 so retrying publish is idempotent.
 */
export async function preparePublication(
	db: D1Database,
	runId: string,
	options: { now?: Date; generation?: () => string; coverageBucket?: R2Bucket } = {}
): Promise<PreparedPublication> {
	const controlState = new Map((await queryAll<{ key: string; value: string }>(
		db,
		`SELECT key, value FROM pipeline_state
		 WHERE key IN ('pipeline:stage-lease', 'schema_version')`
	)).map((row) => [row.key, row.value]));
	let leaseOwner: { stage?: string; runId?: string } | null = null;
	try {
		const leaseValue = controlState.get('pipeline:stage-lease');
		leaseOwner = leaseValue ? JSON.parse(leaseValue) as { stage?: string; runId?: string } : null;
	} catch {
		leaseOwner = null;
	}
	if (leaseOwner?.stage !== 'publish' || leaseOwner.runId !== runId) {
		throw new Error('Publish does not own the global pipeline stage lease');
	}
	if (controlState.get('schema_version') !== REQUIRED_SCHEMA_VERSION) {
		throw new Error(`Schema ${REQUIRED_SCHEMA_VERSION} is required to publish`);
	}
	if (!options.coverageBucket) throw new Error('EXPORTS binding is required to verify coverage');
	const coverageManifest = await verifyStoredFDICCoverageManifest(db, runId, options.coverageBucket);
	const check = await checkReleaseCandidates(db, { coverageRunId: runId });
	if (!check.latestFinancialQuarter) throw new Error('No financial quarter is available to publish');
	if (check.staleDatasets.length > 0) {
		throw new Error(`Release is incomplete: ${check.staleDatasets.join(', ')}`);
	}
	if (check.activePartitions.length > 0) {
		throw new Error(`FDIC partitions are still active: ${check.activePartitions.join(', ')}`);
	}
	if (check.partitionIssues.length > 0) {
		throw new Error(`FDIC publications are inconsistent: ${check.partitionIssues.join(', ')}`);
	}

	const control = await readPublicationControl(db);
	if (!control) throw new Error('Publication control is unavailable');
	const publishedCoverage = new Map((await queryAll<{ key: string; value: string }>(
		db,
		`SELECT key, value FROM pipeline_state WHERE key IN (?, ?)`,
		[PUBLISHED_COVERAGE_RUN_KEY, PUBLISHED_COVERAGE_MANIFEST_KEY]
	)).map((row) => [row.key, row.value]));
	const publishedCandidateMatches = control.state === 'ready'
		&& control.release === check.latestFinancialQuarter
		&& control.generation
		&& publishedCoverage.get(PUBLISHED_COVERAGE_RUN_KEY) === runId
		&& publishedCoverage.get(PUBLISHED_COVERAGE_MANIFEST_KEY) === coverageManifest.manifest_sha256;
	const existingReadiness = publishedCandidateMatches
		? await readPersistedReleaseReadiness(db)
		: null;
	if (publishedCandidateMatches
		&& existingReadiness?.ready
		&& existingReadiness.attestation?.runId === runId
		&& existingReadiness.attestation.coverageManifestSha256 === coverageManifest.manifest_sha256) {
		return {
			repdte: check.latestFinancialQuarter,
			publishedAt: existingReadiness.publishedRelease?.publishedAt ?? control.updatedAt,
			generation: existingReadiness.attestation.generation,
			runId,
			coverageManifestSha256: coverageManifest.manifest_sha256,
			coverageItemCount: coverageManifest.item_count,
			financialHistoryStart: check.financialHistoryStart ?? CANONICAL_FINANCIAL_START,
			financialRowCount: check.financialRowCount,
			alreadyReady: true
		};
	}
	const runCheck = await checkPipelineRunComplete(db, runId);
	if (!runCheck.ready) {
		throw new Error(`Pipeline run is incomplete: ${runCheck.missing.join(', ')}`);
	}

	const generation = control.pendingRelease === check.latestFinancialQuarter
		&& control.pendingRunId === runId
		&& control.pendingGeneration
		? control.pendingGeneration
		: (options.generation ?? (() => crypto.randomUUID()))();
	const publishedAt = (options.now ?? new Date()).toISOString();
	await db.prepare(
		`UPDATE release_control
		 SET pending_release = ?, pending_generation = ?, pending_run_id = ?, updated_at = ?
		 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')`
	).bind(check.latestFinancialQuarter, generation, runId, publishedAt).run();

	return {
		repdte: check.latestFinancialQuarter,
		publishedAt,
		generation,
		runId,
		coverageManifestSha256: coverageManifest.manifest_sha256,
		coverageItemCount: coverageManifest.item_count,
		financialHistoryStart: check.financialHistoryStart ?? CANONICAL_FINANCIAL_START,
		financialRowCount: check.financialRowCount,
		alreadyReady: false
	};
}

/** Open the D1 gate atomically after the cache generation has been written. */
export async function finalizePublication(
	db: D1Database,
	publication: PreparedPublication,
	now = new Date().toISOString()
): Promise<PublishedRelease> {
	if (publication.alreadyReady) {
		return { repdte: publication.repdte, publishedAt: publication.publishedAt };
	}
	const results = await db.batch([
		db.prepare(
			`INSERT INTO release_attestations (
			   generation, release, run_id, schema_version,
			   coverage_manifest_sha256, coverage_item_count,
			   financial_history_start, financial_row_count, attested_at
			 )
			 SELECT pending_generation, pending_release, pending_run_id, ?, ?, ?, ?, ?, ?
			 FROM release_control
			 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')
			   AND pending_release = ? AND pending_generation = ? AND pending_run_id = ?`
		).bind(
			REQUIRED_SCHEMA_VERSION,
			publication.coverageManifestSha256,
			publication.coverageItemCount,
			publication.financialHistoryStart,
			publication.financialRowCount,
			now,
			publication.repdte,
			publication.generation,
			publication.runId
		),
		db.prepare(
			`INSERT INTO pipeline_state (key, value, updated_at)
			 SELECT ?, pending_release, ? FROM release_control
			 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')
			   AND pending_release = ? AND pending_generation = ? AND pending_run_id = ?
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		).bind(
			PUBLISHED_RELEASE_KEY,
			now,
			publication.repdte,
			publication.generation,
			publication.runId
		),
		db.prepare(
			`INSERT INTO pipeline_state (key, value, updated_at)
			 SELECT ?, ?, ? FROM release_control
			 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')
			   AND pending_release = ? AND pending_generation = ? AND pending_run_id = ?
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		).bind(
			PUBLISHED_COVERAGE_RUN_KEY,
			publication.runId,
			now,
			publication.repdte,
			publication.generation,
			publication.runId
		),
		db.prepare(
			`INSERT INTO pipeline_state (key, value, updated_at)
			 SELECT ?, ?, ? FROM release_control
			 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')
			   AND pending_release = ? AND pending_generation = ? AND pending_run_id = ?
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		).bind(
			PUBLISHED_COVERAGE_MANIFEST_KEY,
			publication.coverageManifestSha256,
			now,
			publication.repdte,
			publication.generation,
			publication.runId
		),
		db.prepare(
			`UPDATE release_control
			 SET state = 'ready', release = pending_release, generation = pending_generation,
			     pending_release = NULL, pending_generation = NULL, pending_run_id = NULL,
			     updated_at = ?
			 WHERE singleton = 1 AND state IN ('unpublished', 'refreshing', 'ready')
			   AND pending_release = ? AND pending_generation = ? AND pending_run_id = ?`
		).bind(now, publication.repdte, publication.generation, publication.runId)
	]);
	if (results.some((result) => (result?.meta.changes ?? 0) !== 1)) {
		throw new Error('Publication reservation changed before it could be finalized');
	}
	return { repdte: publication.repdte, publishedAt: now };
}
