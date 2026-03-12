import { describe, it, expect, vi } from 'vitest';
import { cacheGet, cacheSet, cacheWrap } from './cache';

/** Create a mock KVNamespace */
function createMockKV(stored: Record<string, string> = {}) {
	const kv: any = {
		get: vi.fn(async (key: string) => stored[key] ?? null),
		put: vi.fn(async () => {})
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
		const kv = createMockKV({ 'key': JSON.stringify({ result: 'cached' }) });
		const fn = vi.fn().mockResolvedValue({ result: 'fresh' });

		const result = await cacheWrap(kv, 'key', 300, fn);

		expect(fn).not.toHaveBeenCalled();
		expect(result).toEqual({ result: 'cached' });
	});

	it('calls fn on cache miss and writes result to KV', async () => {
		const kv = createMockKV(); // empty cache
		const fn = vi.fn().mockResolvedValue({ result: 'computed' });

		const result = await cacheWrap(kv, 'key', 600, fn);

		expect(fn).toHaveBeenCalledOnce();
		expect(result).toEqual({ result: 'computed' });
		expect(kv.put).toHaveBeenCalledWith(
			'key',
			JSON.stringify({ result: 'computed' }),
			{ expirationTtl: 600 }
		);
	});

	it('still returns fn result even if cache write fails', async () => {
		const kv = createMockKV();
		kv.put.mockRejectedValue(new Error('write failed'));
		const fn = vi.fn().mockResolvedValue(42);

		const result = await cacheWrap(kv, 'key', 300, fn);
		expect(result).toBe(42);
	});
});
