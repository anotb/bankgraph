import { describe, expect, it, vi } from 'vitest';
import {
	acquirePublishedReadSnapshot,
	assertPublicationBarrierClosed,
	closeBarrierUnlessPublished,
	validatePublishedReadSnapshot
} from './publication-barrier';

describe('read-only publication fencing', () => {
	it('admits only the release returned by the authoritative D1 join', async () => {
		const first = vi.fn(async () => ({ release: '20260630', generation: 'generation-1' }));
		const db = { prepare: vi.fn(() => ({ first })) } as unknown as D1Database;
		await expect(acquirePublishedReadSnapshot(db)).resolves.toEqual({
			release: '20260630',
			generation: 'generation-1'
		});
		expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("control.state = 'ready'"));
	});

	it('validates the exact release and generation after rendering', async () => {
		const first = vi.fn(async () => ({ valid: 1 }));
		const bind = vi.fn(() => ({ first }));
		const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
		await expect(validatePublishedReadSnapshot(db, {
			release: '20260630',
			generation: 'generation-1'
		})).resolves.toBe(true);
		expect(bind).toHaveBeenCalledWith('20260630', 'generation-1');
	});

	it('fails closed when the gate changed before response delivery', async () => {
		const db = {
			prepare: vi.fn(() => ({ bind: () => ({ first: async () => null }) }))
		} as unknown as D1Database;
		await expect(validatePublishedReadSnapshot(db, {
			release: '20260630',
			generation: 'generation-1'
		})).resolves.toBe(false);
	});

	it('requires the authoritative gate to remain closed during maintenance work', async () => {
		const refreshing = {
			prepare: vi.fn(() => ({ first: async () => ({ state: 'refreshing' }) }))
		} as unknown as D1Database;
		await expect(assertPublicationBarrierClosed(refreshing)).resolves.toBeUndefined();

		const ready = {
			prepare: vi.fn(() => ({ first: async () => ({ state: 'ready' }) }))
		} as unknown as D1Database;
		await expect(assertPublicationBarrierClosed(ready)).rejects.toThrow(
			'D1 publication barrier is not closed'
		);
	});

	it('keeps a valid published release available during routine work', async () => {
		const run = vi.fn(async () => ({ meta: { changes: 1 } }));
		const db = {
			prepare: vi.fn(() => ({
				first: async () => ({ release: '20260630', generation: 'generation-1' }),
				bind: () => ({ run })
			}))
		} as unknown as D1Database;

		await expect(closeBarrierUnlessPublished(db)).resolves.toBe(false);
		expect(run).not.toHaveBeenCalled();
	});

	it('keeps initial population fail-closed when no release exists', async () => {
		const run = vi.fn(async () => ({ meta: { changes: 1 } }));
		const prepare = vi.fn()
			.mockReturnValueOnce({ first: async () => null })
			.mockReturnValueOnce({ bind: () => ({ run }) });
		const db = { prepare } as unknown as D1Database;

		await expect(closeBarrierUnlessPublished(db)).resolves.toBe(true);
		expect(run).toHaveBeenCalledOnce();
	});
});
