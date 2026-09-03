// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
	PERSISTED_RELEASE_READINESS_SQL,
	readPersistedReleaseReadiness
} from './release';

const completeRow = {
	state: 'ready' as const,
	release: '20260630',
	generation: 'generation-1',
	pending_release: null,
	pending_generation: null,
	pending_run_id: null,
	updated_at: '2026-08-30T12:00:00.000Z',
	schema_version: '0024',
	published_release: '20260630',
	published_at: '2026-08-30T12:00:00.000Z',
	published_coverage_run_id: 'run-1',
	published_coverage_manifest_sha256: 'a'.repeat(64),
	attested_release: '20260630',
	attested_generation: 'generation-1',
	attested_run_id: 'run-1',
	attested_schema_version: '0024',
	attested_coverage_manifest_sha256: 'a'.repeat(64),
	attested_coverage_item_count: 167,
	attested_financial_history_start: '19920331',
	attested_financial_row_count: 1_140_484,
	attested_at: '2026-08-30T12:00:00.000Z',
	stored_coverage_manifest_sha256: 'a'.repeat(64),
	stored_coverage_item_count: 167
};

function readinessDB(row: typeof completeRow): D1Database {
	return {
		prepare: vi.fn(() => ({
			first: vi.fn(async () => row)
		}))
	} as unknown as D1Database;
}

describe('persisted release readiness', () => {
	it('accepts only an internally consistent publication attestation', async () => {
		const db = readinessDB(completeRow);
		const result = await readPersistedReleaseReadiness(db);

		expect(result.ready).toBe(true);
		expect(result.issues).toEqual([]);
		expect(result.attestation).toMatchObject({
			release: '20260630',
			runId: 'run-1',
			financialHistoryStart: '19920331',
			financialRowCount: 1_140_484
		});
		expect(db.prepare).toHaveBeenCalledTimes(1);
		expect(db.prepare).toHaveBeenCalledWith(PERSISTED_RELEASE_READINESS_SQL);
	});

	it('fails closed when a published marker no longer matches the stored manifest', async () => {
		const result = await readPersistedReleaseReadiness(readinessDB({
			...completeRow,
			published_coverage_manifest_sha256: 'b'.repeat(64)
		}));

		expect(result.ready).toBe(false);
		expect(result.issues).toContain('published_coverage_marker_mismatch');
	});

	it('uses only singleton and primary-key tables in its public query', () => {
		const forbidden = [
			'financials',
			'fdic_coverage_manifest_items',
			'fdic_dataset_publications',
			'fdic_ingest_runs',
			'fdic_ingest_partitions'
		];
		for (const table of forbidden) {
			expect(PERSISTED_RELEASE_READINESS_SQL.toLowerCase()).not.toContain(table);
		}
		expect(PERSISTED_RELEASE_READINESS_SQL).not.toMatch(/\b(COUNT|MIN|MAX|GROUP BY|ORDER BY)\s*\(/i);

		const sqlite = new DatabaseSync(':memory:');
		try {
			sqlite.exec(`
				CREATE TABLE release_control (
				  singleton INTEGER PRIMARY KEY, state TEXT, release TEXT, generation TEXT,
				  pending_release TEXT, pending_generation TEXT, pending_run_id TEXT, updated_at TEXT
				);
				CREATE TABLE pipeline_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT) WITHOUT ROWID;
				CREATE TABLE release_attestations (
				  generation TEXT PRIMARY KEY, release TEXT, run_id TEXT, schema_version TEXT,
				  coverage_manifest_sha256 TEXT, coverage_item_count INTEGER,
				  financial_history_start TEXT, financial_row_count INTEGER, attested_at TEXT
				) WITHOUT ROWID;
				CREATE TABLE fdic_coverage_manifests (
				  run_id TEXT PRIMARY KEY, manifest_sha256 TEXT, item_count INTEGER
				) WITHOUT ROWID;
			`);
			const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${PERSISTED_RELEASE_READINESS_SQL}`)
				.all() as Array<{ detail: string }>;
			const details = plan.map((step) => step.detail).join('\n');

			expect(details).not.toMatch(/\bSCAN\b/i);
			expect(details.match(/\bSEARCH\b/gi)?.length).toBeGreaterThanOrEqual(7);
		} finally {
			sqlite.close();
		}
	});
});
