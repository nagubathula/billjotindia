import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";

const scrypt = promisify(scryptCallback);

export type StorefrontCustomerPublic = {
  id: string;
  restaurant_id: string;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
};

type TokenPayload = {
  v: 1;
  cid: string;
  rid: string;
  email: string;
  exp: number;
};

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function signingSecret(): string {
  const base =
    process.env.CUSTOMER_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "billjot-dev-customer-secret";
  return `billjot-storefront-customer-v1:${base}`;
}

export async function hashCustomerPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyCustomerPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (salt.length === 0 || expected.length !== 64) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function issueCustomerToken(
  customer: Pick<StorefrontCustomerPublic, "id" | "restaurant_id" | "email">,
  ttlSeconds = SESSION_TTL_SECONDS,
): string {
  const payload: TokenPayload = {
    v: 1,
    cid: customer.id,
    rid: customer.restaurant_id,
    email: customer.email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", signingSecret())
    .update(encoded)
    .digest("base64url");
  return `bjc_${encoded}.${sig}`;
}

export function verifyCustomerToken(
  rawToken: string | null | undefined,
  expectedRestaurantId: string,
): { customerId: string; restaurantId: string; email: string } | null {
  if (!rawToken) return null;
  const trimmed = rawToken.trim();
  if (!trimmed.startsWith("bjc_")) return null;
  const body = trimmed.slice(4);
  const dot = body.indexOf(".");
  if (dot <= 0) return null;
  const encoded = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  if (!encoded || !sig) return null;

  const expectedSig = createHmac("sha256", signingSecret())
    .update(encoded)
    .digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<TokenPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.cid !== "string" ||
      typeof parsed.rid !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.rid !== expectedRestaurantId) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      customerId: parsed.cid,
      restaurantId: parsed.rid,
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

export function presentedCustomerToken(request: Request): string | null {
  return request.headers.get("x-customer-token")?.trim() || null;
}

export async function resolveOptionalCustomerIdForOrder(
  request: Request,
  outletId: string,
): Promise<string | null> {
  const token = presentedCustomerToken(request);
  if (!token) return null;
  try {
    const admin = createAdminClient();
    const { data: outlet } = await admin
      .from("outlets")
      .select("restaurant_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outlet) return null;
    const verified = verifyCustomerToken(token, outlet.restaurant_id);
    return verified?.customerId ?? null;
  } catch {
    return null;
  }
}
