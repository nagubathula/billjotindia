import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateApiKey,
  generateApiKey,
  hashApiKey,
  isApiKeyScope,
  keyCoversOutlet,
  presentedApiKey,
} from "@/lib/api-keys";
import {
  apiCorsHeaders,
  isOriginAllowedForKey,
  normalizeOriginInput,
} from "@/lib/api-cors";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { createAdminClient } from "@/lib/supabase/admin";

const REST_ID = "11111111-1111-4111-8111-111111111111";
const OUTLET_A = "22222222-2222-4222-8222-222222222222";
const OUTLET_B = "33333333-3333-4333-8333-333333333333";

function makeMockKeySupabase(row: {
  id: string;
  restaurant_id: string;
  outlet_id: string | null;
  scopes: string[];
  allowed_origins: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  key_hash: string;
} | null) {
  return {
    from() {
      let hashFilter: string | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "key_hash") hashFilter = val;
          return builder;
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
        async maybeSingle() {
          if (row && row.key_hash === hashFilter) {
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

test("generateApiKey & presentedApiKey parse Bearer and x-api-key headers", () => {
  const generated = generateApiKey();
  assert.ok(generated.key.startsWith("bjk_"));
  assert.equal(generated.prefix, generated.key.slice(0, 12));
  assert.equal(generated.hash, hashApiKey(generated.key));
  assert.equal(isApiKeyScope("menu:read"), true);
  assert.equal(isApiKeyScope("orders:write"), true);
  assert.equal(isApiKeyScope("admin:delete"), false);

  const reqBearer = new Request("https://app.billjot.com/api/menu", {
    headers: { Authorization: `Bearer ${generated.key}` },
  });
  assert.equal(presentedApiKey(reqBearer), generated.key);

  const reqHeader = new Request("https://app.billjot.com/api/menu", {
    headers: { "x-api-key": generated.key },
  });
  assert.equal(presentedApiKey(reqHeader), generated.key);
});

test("authenticateApiKey enforces hash, revocation, scope, and per-key allowed_origins", async () => {
  const { key, hash } = generateApiKey();
  const mockSb = makeMockKeySupabase({
    id: "key-1",
    restaurant_id: REST_ID,
    outlet_id: OUTLET_A,
    scopes: ["menu:read"],
    allowed_origins: ["https://order.manaruchulu.in"],
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    key_hash: hash,
  });

  // 1. Missing key -> 401
  const missing = await authenticateApiKey(
    new Request("https://app.billjot.com/api/menu"),
    "menu:read",
    mockSb,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 401);

  // 2. Valid key, server-to-server (no Origin) -> ok
  const serverCall = await authenticateApiKey(
    new Request("https://app.billjot.com/api/menu", {
      headers: { Authorization: `Bearer ${key}` },
    }),
    "menu:read",
    mockSb,
  );
  assert.equal(serverCall.ok, true);

  // 3. Valid key, lacking orders:write scope -> 403
  const missingScope = await authenticateApiKey(
    new Request("https://app.billjot.com/api/orders", {
      headers: { Authorization: `Bearer ${key}` },
    }),
    "orders:write",
    mockSb,
  );
  assert.equal(missingScope.ok, false);
  if (!missingScope.ok) assert.equal(missingScope.status, 403);

  // 4. Browser call from unauthorized Origin -> 403
  const badOrigin = await authenticateApiKey(
    new Request("https://app.billjot.com/api/menu", {
      headers: {
        Authorization: `Bearer ${key}`,
        Origin: "https://evil.example.com",
      },
    }),
    "menu:read",
    mockSb,
  );
  assert.equal(badOrigin.ok, false);
  if (!badOrigin.ok) assert.equal(badOrigin.status, 403);

  // 5. Browser call from allowed Origin -> ok
  const goodOrigin = await authenticateApiKey(
    new Request("https://app.billjot.com/api/menu", {
      headers: {
        Authorization: `Bearer ${key}`,
        Origin: "https://order.manaruchulu.in",
      },
    }),
    "menu:read",
    mockSb,
  );
  assert.equal(goodOrigin.ok, true);
  if (goodOrigin.ok) {
    assert.equal(
      keyCoversOutlet(goodOrigin.key, {
        id: OUTLET_A,
        restaurant_id: REST_ID,
      }),
      true,
    );
    assert.equal(
      keyCoversOutlet(goodOrigin.key, {
        id: OUTLET_B,
        restaurant_id: REST_ID,
      }),
      false,
    );
  }
});

test("CORS helpers normalize origins and scope Access-Control-Allow-Origin per key", () => {
  const parsed = normalizeOriginInput("Order.Manaruchulu.in/");
  assert.equal(parsed, "https://order.manaruchulu.in");

  const withPath = normalizeOriginInput("https://Order.Manaruchulu.in/menu/");
  assert.equal(withPath, null);

  const bad = normalizeOriginInput("ftp://bad.example.com");
  assert.equal(bad, null);

  assert.equal(
    isOriginAllowedForKey("https://order.manaruchulu.in", [
      "https://order.manaruchulu.in",
    ]),
    true,
  );
  assert.equal(
    isOriginAllowedForKey("https://other.manaruchulu.in", [
      "https://order.manaruchulu.in",
    ]),
    false,
  );

  const cors = apiCorsHeaders("https://order.manaruchulu.in", "GET, OPTIONS", [
    "https://order.manaruchulu.in",
  ]);
  assert.equal(
    cors["Access-Control-Allow-Origin"],
    "https://order.manaruchulu.in",
  );
});

test("checkRateLimit enforces fixed-window limits and emits Retry-After headers", async () => {
  const bucket = `unit-test:${Date.now()}`;
  const r1 = await checkRateLimit({
    bucket,
    limit: 2,
    windowSeconds: 60,
    useDatabase: false,
  });
  const r2 = await checkRateLimit({
    bucket,
    limit: 2,
    windowSeconds: 60,
    useDatabase: false,
  });
  const r3 = await checkRateLimit({
    bucket,
    limit: 2,
    windowSeconds: 60,
    useDatabase: false,
  });

  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 0);
  assert.equal(r3.allowed, false);
  const hdrs = rateLimitHeaders(r3);
  assert.equal(hdrs["X-RateLimit-Limit"], "2");
  assert.ok(Number(hdrs["Retry-After"]) >= 1);
});
