/**
 * KV cache helpers for Cloudflare Workers.
 * Gracefully no-ops when KV is unavailable (local dev).
 */

/** Get a cached value from KV. Returns null on miss or if KV is unavailable. */
export async function cacheGet<T>(
  kv: KVNamespace | undefined,
  key: string
): Promise<T | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key, 'text');
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write a value to KV cache with a TTL in seconds. No-ops if KV is unavailable. */
export async function cacheSet(
  kv: KVNamespace | undefined,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {
    // Swallow errors; cache is best-effort
  }
}

/**
 * Cache-aside wrapper. Returns cached value if available,
 * otherwise calls fn(), caches the result, and returns it.
 */
export async function cacheWrap<T>(
  kv: KVNamespace | undefined,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(kv, key);
  if (cached !== null) return cached;

  const result = await fn();
  // Fire-and-forget the cache write
  await cacheSet(kv, key, result, ttlSeconds);
  return result;
}
