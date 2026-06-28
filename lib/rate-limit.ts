// Lightweight in-memory fixed-window rate limiter.
//
// Scope/limits: state lives in the module (per process). For this single-
// instance internal tool that is enough; it intentionally adds no Redis/infra.
// In a multi-instance/serverless deployment each instance keeps its own counter
// and state resets on restart — swap this for a shared store if that changes.

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

// Opportunistic cleanup so the map can't grow unbounded across many keys.
function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true while the key is under `limit` failures within `windowMs`. */
export function isRateLimitOk(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const window = buckets.get(key);
  if (!window || window.resetAt <= now) return true;
  return window.count < limit;
}

/** Records one failed attempt for the key, opening a window if needed. */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  prune(now);
  const window = buckets.get(key);
  if (!window || window.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  window.count += 1;
}

/** Clears the key's failures (call on a successful attempt). */
export function clearFailures(key: string): void {
  buckets.delete(key);
}
