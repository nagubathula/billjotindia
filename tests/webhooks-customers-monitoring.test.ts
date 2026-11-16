import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashCustomerPassword,
  issueCustomerToken,
  verifyCustomerPassword,
  verifyCustomerToken,
} from "@/lib/storefront-customers";
import {
  generateWebhookSecret,
  normalizeWebhookUrl,
  signOrderWebhookBody,
} from "@/lib/order-webhooks";
import { parseSentryDsn } from "@/lib/monitoring";
import {
  resolveChannelStoreOutlet,
  signChannelBridgeBody,
  type ChannelStoreLookupClient,
} from "@/lib/channel-bridge";

describe("storefront customer auth & session tokens", () => {
  it("hashes and verifies customer passwords with scrypt", async () => {
    const hash = await hashCustomerPassword("CorrectHorseBatteryStaple!");
    assert.ok(hash.startsWith("scrypt$"));
    assert.equal(
      await verifyCustomerPassword("CorrectHorseBatteryStaple!", hash),
      true,
    );
    assert.equal(await verifyCustomerPassword("wrong-password", hash), false);
    assert.equal(await verifyCustomerPassword("anything", "malformed"), false);
  });

  it("issues restaurant-scoped HMAC tokens and rejects tampering or expiry", () => {
    const restA = "11111111-1111-4111-8111-111111111111";
    const restB = "22222222-2222-4222-8222-222222222222";
    const custId = "33333333-3333-4333-8333-333333333333";

    const token = issueCustomerToken({
      id: custId,
      restaurant_id: restA,
      email: "Priya@Example.com",
    });
    assert.ok(token.startsWith("bjc_"));

    const verified = verifyCustomerToken(token, restA);
    assert.deepEqual(verified, {
      customerId: custId,
      restaurantId: restA,
      email: "priya@example.com",
    });

    // Wrong restaurant rejected
    assert.equal(verifyCustomerToken(token, restB), null);

    // Tampered signature rejected
    const tampered = `${token.slice(0, -2)}zz`;
    assert.equal(verifyCustomerToken(tampered, restA), null);

    // Expired token rejected
    const expired = issueCustomerToken(
      { id: custId, restaurant_id: restA, email: "priya@example.com" },
      -10,
    );
    assert.equal(verifyCustomerToken(expired, restA), null);
  });
});

describe("order status webhooks", () => {
  it("generates whsec_ secrets and signs webhook bodies with HMAC-SHA256", () => {
    const secret = generateWebhookSecret();
    assert.ok(secret.startsWith("whsec_"));
    assert.ok(secret.length > 20);

    const body = JSON.stringify({ event: "order.updated", order: { id: "abc" } });
    const sig1 = signOrderWebhookBody(body, secret);
    const sig2 = signOrderWebhookBody(body, secret);
    assert.ok(sig1.startsWith("sha256="));
    assert.equal(sig1.length, 7 + 64);
    assert.equal(sig1, sig2);
    assert.notEqual(sig1, signOrderWebhookBody(body, "whsec_different"));
  });

  it("normalizes valid HTTP(S) webhook URLs and rejects unsafe schemes/credentials", () => {
    assert.equal(normalizeWebhookUrl(""), "");
    assert.equal(
      normalizeWebhookUrl("https://hooks.mycafe.in/billjot"),
      "https://hooks.mycafe.in/billjot",
    );
    assert.equal(normalizeWebhookUrl("ftp://hooks.mycafe.in/billjot"), null);
    assert.equal(
      normalizeWebhookUrl("https://user:pass@hooks.mycafe.in/billjot"),
      null,
    );
    assert.equal(normalizeWebhookUrl("not-a-url"), null);
  });
});

describe("production monitoring helpers", () => {
  it("parses Sentry DSN into envelope endpoint and public key", () => {
    const parsed = parseSentryDsn(
      "https://abcdef123456@o450000.ingest.us.sentry.io/450999",
    );
    assert.deepEqual(parsed, {
      envelopeUrl: "https://o450000.ingest.us.sentry.io/api/450999/envelope/",
      publicKey: "abcdef123456",
      dsn: "https://abcdef123456@o450000.ingest.us.sentry.io/450999",
    });
    assert.equal(parseSentryDsn(""), null);
    assert.equal(parseSentryDsn("https://invalid-dsn-without-key.io/123"), null);
  });
});

describe("delivery platform channel bridge", () => {
  it("signs outbound bridge events and resolves external_store_id to outlet_id", async () => {
    const sig = signChannelBridgeBody('{"event":"channel.store_updated"}', "chan_sec");
    assert.ok(sig.startsWith("sha256="));
    assert.equal(sig.length, 71);

    const mockDb: ChannelStoreLookupClient = {
      from() {
        return {
          select() {
            return {
              eq(_c1, channelVal) {
                return {
                  eq(_c2, storeVal) {
                    return {
                      async maybeSingle() {
                        if (channelVal === "zomato" && storeVal === "ZOM-901") {
                          return {
                            data: {
                              outlet_id: "549f8322-52c1-4dec-bfc7-2ecd14b83d1a",
                              external_store_id: "ZOM-901",
                              is_online: true,
                              offline_reason: null,
                              prep_time_minutes: 20,
                            },
                          };
                        }
                        return { data: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const hit = await resolveChannelStoreOutlet(mockDb, "zomato", " ZOM-901 ");
    assert.deepEqual(hit, {
      outletId: "549f8322-52c1-4dec-bfc7-2ecd14b83d1a",
      externalStoreId: "ZOM-901",
      isOnline: true,
      offlineReason: null,
      prepTimeMinutes: 20,
    });

    const miss = await resolveChannelStoreOutlet(mockDb, "swiggy", "UNKNOWN");
    assert.equal(miss, null);
  });
});
