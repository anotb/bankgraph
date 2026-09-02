import { describe, expect, it } from 'vitest';
import { allBindingsReady, bindingStatus, liveDataDegradedReason } from './readiness';
import { REQUIRED_SCHEMA_VERSION } from './release';

describe('readiness binding checks', () => {
	it('tracks the latest required production schema', () => {
		expect(REQUIRED_SCHEMA_VERSION).toBe('0024');
	});
	it('requires only the production resources and private pipeline secret', () => {
		const status = bindingStatus({
			DB: {} as D1Database,
			CACHE: {} as KVNamespace,
			EXPORTS: {} as R2Bucket,
			ASSETS: {} as Fetcher,
			PIPELINE_SECRET: 'configured'
		});
			expect(status).toEqual({
			DB: true,
			CACHE: true,
			EXPORTS: true,
			ASSETS: true,
			PIPELINE_SECRET: true
		});
		expect(allBindingsReady(status)).toBe(true);
	});

	it('reports a missing pipeline secret without exposing a value', () => {
		const status = bindingStatus({
			DB: {} as D1Database,
			CACHE: {} as KVNamespace,
			EXPORTS: {} as R2Bucket,
			ASSETS: {} as Fetcher
		});
		expect(status.PIPELINE_SECRET).toBe(false);
		expect(allBindingsReady(status)).toBe(false);
	});
});

describe('live data readiness', () => {
	it('reports the first actionable publication failure', () => {
		expect(liveDataDegradedReason({
			migrationsReady: false,
			datasetsReady: false,
			publicationState: null,
			cacheReady: false
		})).toBe('migration_incomplete');
		expect(liveDataDegradedReason({
			migrationsReady: true,
			datasetsReady: true,
			publicationState: 'refreshing',
			cacheReady: true
		})).toBe('pipeline_refresh_in_progress');
		expect(liveDataDegradedReason({
			migrationsReady: true,
			datasetsReady: false,
			publicationState: null,
			cacheReady: false
		})).toBe('release_unpublished_or_incomplete');
		expect(liveDataDegradedReason({
			migrationsReady: true,
			datasetsReady: true,
			publicationState: null,
			cacheReady: false
		})).toBe('publication_state_unavailable');
		expect(liveDataDegradedReason({
			migrationsReady: true,
			datasetsReady: true,
			publicationState: 'ready',
			cacheReady: false
		})).toBe('cache_generation_mismatch');
		expect(liveDataDegradedReason({
			migrationsReady: true,
			datasetsReady: true,
			publicationState: 'ready',
			cacheReady: true
		})).toBeNull();
	});
});
