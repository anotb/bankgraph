import { describe, it, expect, vi } from 'vitest';
import {
	bumpCacheDataVersion,
	cacheGet,
	cacheSet,
	cacheWrap,
	readCacheDataVersion
} from './cache';

/** Create a mock KVNamespace */
function createMockKV(stored: Record<string, string> = {}) {
	const kv: any = {
		get: vi.fn(async (key: string) => stored[key] ?? null),
		put: vi.fn(async (key: string, value: string) => { stored[key] = value; })
	};
	return kv;
}

describe('cacheGet', () => {
	it('returns null when KV is undefined', async () => {
		const result = await cacheGet(undefined, 'key');
		expect(result).toBeNull();
	});

	it('returns null on cache miss', async () => {
		const kv = createMockKV();
		const result = await cacheGet(kv, 'missing-key');
		expect(result).toBeNull();
		expect(kv.get).toHaveBeenCalledWith('missing-key', 'text');
	});

	it('returns parsed value on cache hit', async () => {
		const kv = createMockKV({ 'my-key': JSON.stringify({ name: 'test' }) });
		const result = await cacheGet<{ name: string }>(kv, 'my-key');
		expect(result).toEqual({ name: 'test' });
	});

	it('returns null when KV.get throws', async () => {
		const kv = createMockKV();
		kv.get.mockRejectedValue(new Error('KV error'));
		const result = await cacheGet(kv, 'key');
		expect(result).toBeNull();
	});

	it('returns null when stored value is not valid JSON', async () => {
		const kv = createMockKV({ 'bad': 'not{json' });
		const result = await cacheGet(kv, 'bad');
		expect(result).toBeNull();
	});
});

describe('cacheSet', () => {
	it('no-ops when KV is undefined', async () => {
		// Should not throw
		await cacheSet(undefined, 'key', { data: 1 }, 300);
	});

	it('calls KV.put with serialized value and TTL', async () => {
		const kv = createMockKV();
		await cacheSet(kv, 'my-key', { count: 42 }, 600);

		expect(kv.put).toHaveBeenCalledWith(
			'my-key',
			JSON.stringify({ count: 42 }),
			{ expirationTtl: 600 }
		);
	});

	it('swallows errors from KV.put', async () => {
		const kv = createMockKV();
		kv.put.mockRejectedValue(new Error('write failed'));

		// Should not throw
		await cacheSet(kv, 'key', 'value', 300);
	});
});

describe('cacheWrap', () => {
	it('calls fn directly when KV is undefined', async () => {
		const fn = vi.fn().mockResolvedValue({ result: 'fresh' });
		const result = await cacheWrap(undefined, 'key', 300, fn);

		expect(fn).toHaveBeenCalledOnce();
		expect(result).toEqual({ result: 'fresh' });
	});

	it('returns cached value on hit without calling fn', async () => {
		const kv = createMockKV({
			'cache:data-version': 'release-1',
			'v:release-1:key': JSON.stringify({ result: 'cached' })
		});
		const fn = vi.fn().mockResolvedValue({ result: 'fresh' });

		const result = await cacheWrap(kv, 'key', 300, fn);

		expect(fn).not.toHaveBeenCalled();
		expect(result).toEqual({ result: 'cached' });
	});

	it('can read an existing cached null without rewriting it', async () => {
		const kv = createMockKV({
			'cache:data-version': 'release-1',
			'v:release-1:key': 'null'
		});
		const fn = vi.fn().mockResolvedValue({ result: 'fresh' });

		const result = await cacheWrap(kv, 'key', 300, fn);

		expect(result).toBeNull();
		expect(fn).not.toHaveBeenCalled();
		expect(kv.put).not.toHaveBeenCalled();
	});

	it('does not create negative entries for null or empty-array results', async () => {
		const kv = createMockKV({ 'cache:data-version': 'release-1' });

		await expect(cacheWrap(kv, 'missing', 300, async () => null)).resolves.toBeNull();
		await expect(cacheWrap(kv, 'empty', 300, async () => [])).resolves.toEqual([]);
		expect(kv.put).not.toHaveBeenCalled();
	});

	it('uses the active data version in cache-aside keys', async () => {
		const kv = createMockKV({
			'cache:data-version': 'release-2',
			'v:release-2:key': JSON.stringify({ result: 'current' })
		});
		const fn = vi.fn();

		expect(await cacheWrap(kv, 'key', 300, fn)).toEqual({ result: 'current' });
		expect(fn).not.toHaveBeenCalled();
	});

	it('uses the authoritative D1 generation instead of a stale KV pointer', async () => {
		const kv = createMockKV({
			'cache:data-version': 'old-generation',
			'v:new-generation:key': JSON.stringify({ result: 'published' })
		});
		const fn = vi.fn();

		expect(await cacheWrap(kv, 'key', 300, fn, 'new-generation'))
			.toEqual({ result: 'published' });
		expect(kv.get).not.toHaveBeenCalledWith('cache:data-version', 'text');
		expect(fn).not.toHaveBeenCalled();
	});

	it('calls fn on cache miss and writes result to KV', async () => {
		const kv = createMockKV({ 'cache:data-version': 'release-1' });
		const fn = vi.fn().mockResolvedValue({ result: 'computed' });

		const result = await cacheWrap(kv, 'key', 600, fn);

		expect(fn).toHaveBeenCalledOnce();
		expect(result).toEqual({ result: 'computed' });
		expect(kv.put).toHaveBeenCalledWith(
			'v:release-1:key',
			JSON.stringify({ result: 'computed' }),
			{ expirationTtl: 600 }
		);
	});

	it('still returns fn result even if cache write fails', async () => {
		const kv = createMockKV({ 'cache:data-version': 'release-1' });
		kv.put.mockRejectedValue(new Error('write failed'));
		const fn = vi.fn().mockResolvedValue(42);

		const result = await cacheWrap(kv, 'key', 300, fn);
		expect(result).toBe(42);
	});

	it('bypasses KV until a published data version exists', async () => {
		const kv = createMockKV({ key: JSON.stringify({ result: 'unversioned' }) });
		const fn = vi.fn().mockResolvedValue({ result: 'live' });

		expect(await cacheWrap(kv, 'key', 300, fn)).toEqual({ result: 'live' });
		expect(fn).toHaveBeenCalledOnce();
		expect(kv.put).not.toHaveBeenCalled();
	});

	it('bypasses KV when the versioned key exceeds the platform byte limit', async () => {
		const kv = createMockKV({ 'cache:data-version': 'release-1' });
		const fn = vi.fn().mockResolvedValue('live');

		expect(await cacheWrap(kv, `query:${'é'.repeat(260)}`, 300, fn)).toBe('live');
		expect(kv.put).not.toHaveBeenCalled();
	});
});

describe('bumpCacheDataVersion', () => {
	it('writes a new opaque generation without exposing application data', async () => {
		const kv = createMockKV();
		const revision = await bumpCacheDataVersion(kv, 1_700_000_000_000);

		expect(revision).toMatch(/^[a-z0-9]+-[0-9a-f-]{36}$/);
		expect(kv.put).toHaveBeenCalledWith('cache:data-version', revision);
	});
});

describe('readCacheDataVersion', () => {
	it('returns only safe published generations', async () => {
		await expect(readCacheDataVersion(createMockKV({ 'cache:data-version': '20260331' })))
			.resolves.toBe('20260331');
		await expect(readCacheDataVersion(createMockKV({ 'cache:data-version': '../bad' })))
			.resolves.toBeNull();
	});
});
