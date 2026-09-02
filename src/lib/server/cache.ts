/**
 * KV cache helpers for Cloudflare Workers.
 * Gracefully no-ops when KV is unavailable (local dev).
 */

const DATA_VERSION_KEY = 'cache:data-version';
const SAFE_DATA_VERSION = /^[A-Za-z0-9._-]{1,96}$/;
const MAX_KV_KEY_BYTES = 512;
const keyEncoder = new TextEncoder();

interface CacheLookup<T> {
  hit: boolean;
  value: T | null;
}

function safeCacheKey(key: string): boolean {
  return key.length > 0
    && key !== '.'
    && key !== '..'
    && keyEncoder.encode(key).byteLength <= MAX_KV_KEY_BYTES;
}

async function cacheLookup<T>(
  kv: KVNamespace | undefined,
  key: string
): Promise<CacheLookup<T>> {
  if (!kv || !safeCacheKey(key)) return { hit: false, value: null };
  try {
    const raw = await kv.get(key, 'text');
    if (raw === null) return { hit: false, value: null };
    return { hit: true, value: JSON.parse(raw) as T };
  } catch {
    return { hit: false, value: null };
  }
}

async function versionedKey(
  kv: KVNamespace,
  key: string,
  authoritativeVersion?: string
): Promise<string | null> {
  try {
    const version = authoritativeVersion ?? await kv.get(DATA_VERSION_KEY, 'text');
    if (!version || !SAFE_DATA_VERSION.test(version)) return null;
    const candidate = `v:${version}:${key}`;
    return safeCacheKey(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Return the release generation used by cache-aside readers. */
export async function readCacheDataVersion(kv: KVNamespace | undefined): Promise<string | null> {
  if (!kv) return null;
  try {
    const version = await kv.get(DATA_VERSION_KEY, 'text');
    return version && SAFE_DATA_VERSION.test(version) ? version : null;
  } catch {
    return null;
  }
}

/** Get a cached value from KV. Returns null on miss or if KV is unavailable. */
export async function cacheGet<T>(
  kv: KVNamespace | undefined,
  key: string
): Promise<T | null> {
  const result = await cacheLookup<T>(kv, key);
  return result.hit ? result.value : null;
}

/** Write a value to KV cache with a TTL in seconds. No-ops if KV is unavailable. */
export async function cacheSet(
  kv: KVNamespace | undefined,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  if (!kv || !safeCacheKey(key)) return;
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
  fn: () => Promise<T>,
  authoritativeVersion?: string
): Promise<T> {
  if (!kv) return fn();
  const effectiveKey = await versionedKey(kv, key, authoritativeVersion);
  // Public requests pass the generation acquired from D1's strong barrier.
  // KV's eventually-consistent pointer remains diagnostic/backward-compatible
  // and is never authoritative for release selection.
  if (!effectiveKey) return fn();
  const cached = await cacheLookup<T>(kv, effectiveKey);
  if (cached.hit) return cached.value as T;

  const result = await fn();
  // Do not let random identifiers populate KV with negative entries.
  if (result !== null && (!Array.isArray(result) || result.length > 0)) {
    await cacheSet(kv, effectiveKey, result, ttlSeconds);
  }
  return result;
}

/**
 * Advance the data generation after a successful pipeline mutation. Existing
 * entries expire normally, while subsequent reads immediately use a fresh key.
 */
export async function bumpCacheDataVersion(
  kv: KVNamespace | undefined,
  now = Date.now()
): Promise<string | null> {
  if (!kv) return null;
  const revision = `${now.toString(36)}-${crypto.randomUUID()}`;
  try {
    await kv.put(DATA_VERSION_KEY, revision);
    return revision;
  } catch {
    return null;
  }
}

/**
 * Point cache-aside readers at one named, published dataset release. This is
 * used by the explicit publish stage rather than by every pipeline mutation.
 */
export async function setCacheDataVersion(
  kv: KVNamespace | undefined,
  revision: string
): Promise<boolean> {
  if (!kv) return false;
  if (!SAFE_DATA_VERSION.test(revision)) throw new Error('Invalid cache data version');
  await kv.put(DATA_VERSION_KEY, revision);
  return true;
}
