import { describe, expect, it, vi } from 'vitest';
import {
	acquirePipelineStageLease,
	parsePipelineRunId,
	releasePipelineStageLease,
	renewPipelineStageLease
} from './stage-lease';

function mockDb(changes: number) {
	const run = vi.fn().mockResolvedValue({ meta: { changes } });
	const bind = vi.fn().mockReturnValue({ run });
	const prepare = vi.fn().mockReturnValue({ bind });
	return { db: { prepare } as unknown as D1Database, prepare, bind, run };
}

describe('pipeline stage lease', () => {
	it('validates caller-provided run identifiers', () => {
		expect(parsePipelineRunId('12345-2')).toBe('12345-2');
		expect(() => parsePipelineRunId('../bad run')).toThrow(/URL-safe/);
		expect(() => parsePipelineRunId('a'.repeat(129))).toThrow(/1-128/);
	});

	it('returns a lease only when the conditional D1 write changes a row', async () => {
		const acquired = mockDb(1);
		const blocked = mockDb(0);

		expect(await acquirePipelineStageLease(acquired.db, 'risk', 'run-1', 1_700_000_000_000))
			.toMatchObject({ key: 'pipeline:stage-lease' });
		expect(await acquirePipelineStageLease(blocked.db, 'risk', 'run-2', 1_700_000_000_000))
			.toBeNull();
		expect(acquired.bind).toHaveBeenCalledWith(
			'pipeline:stage-lease',
			expect.stringContaining('"runId":"run-1"'),
			'2023-11-14T22:13:20.000Z',
			'2023-11-14T21:28:20.000Z'
		);
	});

	it('releases with an owner comparison', async () => {
		const mocked = mockDb(1);
		await releasePipelineStageLease(mocked.db, { key: 'pipeline:stage-lease', value: 'owned' });

		expect(mocked.prepare).toHaveBeenCalledWith(
			'DELETE FROM pipeline_state WHERE key = ? AND value = ?'
		);
		expect(mocked.bind).toHaveBeenCalledWith('pipeline:stage-lease', 'owned');
	});

	it('renews only the current owner token', async () => {
		const owned = mockDb(1);
		const lost = mockDb(0);
		await expect(renewPipelineStageLease(
			owned.db,
			{ key: 'pipeline:stage-lease', value: 'owned' },
			1_700_000_000_000
		)).resolves.toBe(true);
		await expect(renewPipelineStageLease(
			lost.db,
			{ key: 'pipeline:stage-lease', value: 'stale' },
			1_700_000_000_000
		)).resolves.toBe(false);
		expect(owned.bind).toHaveBeenCalledWith(
			'2023-11-14T22:13:20.000Z',
			'pipeline:stage-lease',
			'owned'
		);
	});
});
