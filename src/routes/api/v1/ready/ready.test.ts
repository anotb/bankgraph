import { describe, expect, it, vi } from 'vitest';
import { PERSISTED_RELEASE_READINESS_SQL } from '$lib/server/release';
import { GET } from './+server';

const readinessRow = {
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

function platform(schemaVersion = '0024') {
	const sql: string[] = [];
	const db = {
		prepare: vi.fn((statement: string) => {
			sql.push(statement);
			const prepared = {
				bind: vi.fn(() => prepared),
				first: vi.fn(async () => statement === PERSISTED_RELEASE_READINESS_SQL
					? readinessRow
					: { value: schemaVersion })
			};
			return prepared;
		})
	} as unknown as D1Database;
	const cache = {
		get: vi.fn(async () => 'generation-1')
	} as unknown as KVNamespace;
	return {
		platform: {
			env: {
				DB: db,
				CACHE: cache,
				EXPORTS: {} as R2Bucket,
				ASSETS: {} as Fetcher,
				PIPELINE_SECRET: 'configured'
			}
		} as App.Platform,
		db,
		cache,
		sql
	};
}

describe('public readiness query budget', () => {
	it('serves a valid attestation with two bounded D1 reads and one KV read', async () => {
		const fixture = platform();
		const response = await GET({ platform: fixture.platform } as never);
		const body = await response.json() as { ready: boolean };

		expect(response.status).toBe(200);
		expect(body.ready).toBe(true);
		expect(fixture.sql).toHaveLength(2);
		expect(fixture.sql[1]).toBe(PERSISTED_RELEASE_READINESS_SQL);
		expect(fixture.cache.get).toHaveBeenCalledTimes(1);
	});

	it('stops after the schema marker when the attestation migration is absent', async () => {
		const fixture = platform('0023');
		const response = await GET({ platform: fixture.platform } as never);
		const body = await response.json() as { ready: boolean; liveData: { reason: string } };

		expect(response.status).toBe(503);
		expect(body.ready).toBe(false);
		expect(body.liveData.reason).toBe('migration_incomplete');
		expect(fixture.sql).toHaveLength(1);
		expect(fixture.cache.get).not.toHaveBeenCalled();
	});
});
