const windowMilliseconds = 60_000;
const requestLimit = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMilliseconds });
    return { allowed: true, remaining: requestLimit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= requestLimit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: requestLimit - bucket.count,
    retryAfterSeconds: 0,
  };
}

export function clearRateLimits() {
  buckets.clear();
}