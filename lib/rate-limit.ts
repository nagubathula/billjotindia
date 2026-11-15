// Two-tier rate limiter for the public API (/api/menu, /api/orders).
//
// Tier 1 (in-memory fixed window + short block cache): stops local loops and
// unauthenticated floods in 0ms without touching Postgres.
// Tier 2 (Supabase atomic RPC `consume_rate_limit`): enforces global per-key
// and per-IP counters across all serverless instances in `bom1`. Falls back to
// Tier 1 cleanly if Postgres is unreachable or in offline unit tests.

import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

type LocalEntry = {
  hits: number;
  windowStartMs: number;
  blockedUntilMs: number;
};

const localStore = new Map<string, LocalEntry>();
const MAX_LOCAL_ENTRIES = 5_000;

export function resetLocalRateLimitStore() {
  localStore.clear();
}

export function clientIpFromRequest(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function pruneLocalStore(nowMs: number) {
  if (localStore.size < MAX_LOCAL_ENTRIES) return;
  for (const [k, v] of localStore) {
    if (nowMs - v.windowStartMs > 120_000 && v.blockedUntilMs < nowMs) {
      localStore.delete(k);
    }
  }
  if (localStore.size >= MAX_LOCAL_ENTRIES) {
    localStore.clear();
  }
}

export async function checkRateLimit(opts: {
  bucket: string;
  limit: number;
  windowSeconds?: number;
  useDatabase?: boolean;
  nowMs?: number;
}): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.floor(opts.windowSeconds ?? 60));
  const windowMs = windowSeconds * 1000;
  const nowMs = opts.nowMs ?? Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const resetAtMs = windowStartMs + windowMs;

  pruneLocalStore(nowMs);

  let entry = localStore.get(opts.bucket);
  if (!entry || entry.windowStartMs !== windowStartMs) {
    entry = { hits: 0, windowStartMs, blockedUntilMs: 0 };
    localStore.set(opts.bucket, entry);
  }

  if (entry.blockedUntilMs > nowMs) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.blockedUntilMs - nowMs) / 1000),
    );
    return {
      allowed: false,
      limit: opts.limit,
      remaining: 0,
      resetAtMs: entry.blockedUntilMs,
      retryAfterSeconds,
    };
  }

  entry.hits += 1;
  if (entry.hits > opts.limit) {
    entry.blockedUntilMs = resetAtMs;
    return {
      allowed: false,
      limit: opts.limit,
      remaining: 0,
      resetAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000)),
    };
  }

  const useDb =
    opts.useDatabase ??
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

  if (useDb) {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_bucket: opts.bucket,
        p_window_seconds: windowSeconds,
      });
      if (!error && data && typeof data === "object" && !Array.isArray(data)) {
        const payload = data as { hits?: unknown; reset_at?: unknown };
        const dbHits = Number(payload.hits) || entry.hits;
        const dbResetMs =
          typeof payload.reset_at === "string"
            ? new Date(payload.reset_at).getTime() || resetAtMs
            : resetAtMs;
        entry.hits = Math.max(entry.hits, dbHits);
        if (dbHits > opts.limit) {
          entry.blockedUntilMs = dbResetMs;
          return {
            allowed: false,
            limit: opts.limit,
            remaining: 0,
            resetAtMs: dbResetMs,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((dbResetMs - nowMs) / 1000),
            ),
          };
        }
        return {
          allowed: true,
          limit: opts.limit,
          remaining: Math.max(0, opts.limit - dbHits),
          resetAtMs: dbResetMs,
          retryAfterSeconds: 0,
        };
      }
    } catch {
      // Fall back to in-memory counter if DB call fails
    }
  }

  return {
    allowed: true,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - entry.hits),
    resetAtMs,
    retryAfterSeconds: 0,
  };
}

export function rateLimitHeaders(res: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(res.limit),
    "X-RateLimit-Remaining": String(res.remaining),
    "X-RateLimit-Reset": String(Math.ceil(res.resetAtMs / 1000)),
  };
  if (!res.allowed) {
    headers["Retry-After"] = String(res.retryAfterSeconds);
  }
  return headers;
}
