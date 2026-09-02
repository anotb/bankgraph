import { describe, expect, it, vi } from 'vitest';
import { coordinatePublication } from './publication-coordinator';
import type { PreparedPublication } from './release';

const db = {} as D1Database;
const cache = {} as KVNamespace;
const bucket = {} as R2Bucket;

function prepared(overrides: Partial<PreparedPublication> = {}): PreparedPublication {
	return {
		repdte: '20260630',
		publishedAt: '2026-08-30T12:00:00.000Z',
		generation: 'generation-1',
		runId: 'run-1',
		coverageManifestSha256: 'a'.repeat(64),
		coverageItemCount: 42,
		financialHistoryStart: '19920331',
		financialRowCount: 1_140_484,
		alreadyReady: false,
		...overrides
	};
}

describe('publication coordinator failure boundaries', () => {
	it('does not touch KV or finalize when D1 reservation fails', async () => {
		const writeCacheGeneration = vi.fn(async () => true);
		const finalize = vi.fn();
		await expect(coordinatePublication(db, cache, bucket, 'run-1', {
			prepare: vi.fn(async () => { throw new Error('reservation failed'); }),
			writeCacheGeneration,
			finalize
		})).rejects.toThrow('reservation failed');
		expect(writeCacheGeneration).not.toHaveBeenCalled();
		expect(finalize).not.toHaveBeenCalled();
	});

	it('keeps D1 closed when the KV generation write fails', async () => {
		const publication = prepared();
		const finalize = vi.fn();
		await expect(coordinatePublication(db, cache, bucket, 'run-1', {
			prepare: vi.fn(async () => publication),
			writeCacheGeneration: vi.fn(async () => { throw new Error('KV unavailable'); }),
			finalize
		})).rejects.toThrow('KV unavailable');
		expect(finalize).not.toHaveBeenCalled();
	});

	it('retries the same pending generation after an unknown finalize failure', async () => {
		const publication = prepared();
		const prepare = vi.fn(async () => publication);
		const writeCacheGeneration = vi.fn(async () => true);
		const finalize = vi.fn()
			.mockRejectedValueOnce(new Error('unknown D1 commit'))
			.mockResolvedValueOnce({ repdte: publication.repdte, publishedAt: publication.publishedAt });
		const dependencies = { prepare, writeCacheGeneration, finalize };

		await expect(coordinatePublication(db, cache, bucket, 'run-1', dependencies))
			.rejects.toThrow('unknown D1 commit');
		await expect(coordinatePublication(db, cache, bucket, 'run-1', dependencies))
			.resolves.toMatchObject({ generation: 'generation-1' });
		expect(writeCacheGeneration).toHaveBeenNthCalledWith(1, cache, 'generation-1');
		expect(writeCacheGeneration).toHaveBeenNthCalledWith(2, cache, 'generation-1');
	});
});
