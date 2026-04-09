/**
 * Lightweight SWR-style module-level cache.
 * Lives outside React components so it survives unmount/remount (page navigation).
 *
 * Usage:
 *   import { pageCache } from '../services/page-cache';
 *
 *   // Read (returns null if miss or stale)
 *   const hit = pageCache.get('team', orgId);
 *   if (hit) setState(hit);
 *
 *   // Write after successful fetch
 *   pageCache.set('team', orgId, data);
 *
 *   // Invalidate after mutation
 *   pageCache.bust('team', orgId);
 */

const TTL_MS = 60_000; // 60 s — serve stale data up to this age
const _store = new Map(); // `${ns}:${key}` -> { data, ts }

function cacheKey(ns, key) {
  return `${ns}:${key}`;
}

export const pageCache = {
  /** Returns data if cache hit and not expired, else null. */
  get(ns, key) {
    const entry = _store.get(cacheKey(ns, key));
    if (!entry) return null;
    return entry; // caller decides whether to revalidate based on ts
  },

  /** Returns data only if fresh (within TTL). */
  getFresh(ns, key) {
    const entry = _store.get(cacheKey(ns, key));
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) return null;
    return entry.data;
  },

  /** Store data with current timestamp. */
  set(ns, key, data) {
    _store.set(cacheKey(ns, key), { data, ts: Date.now() });
  },

  /** Check if cache is stale (needs revalidation). */
  isStale(ns, key) {
    const entry = _store.get(cacheKey(ns, key));
    if (!entry) return true;
    return Date.now() - entry.ts > TTL_MS;
  },

  /** Remove a specific cache entry. */
  bust(ns, key) {
    _store.delete(cacheKey(ns, key));
  },

  /** Remove all entries for a namespace. */
  bustNs(ns) {
    for (const k of _store.keys()) {
      if (k.startsWith(`${ns}:`)) _store.delete(k);
    }
  },
};
