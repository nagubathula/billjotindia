import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey } from "@/lib/api-keys";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  hashCustomerPassword,
  issueCustomerToken,
} from "@/lib/storefront-customers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `customer-register:ip:${ip}`,
    limit: 15,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Please wait a minute." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  const auth = await authenticateApiKey(request, "orders:write");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }
  cors = {
    ...apiCorsHeaders(origin, "POST, OPTIONS", auth.key.allowedOrigins, request.url),
    ...rateLimitHeaders(ipLimit),
  };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  let body: {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Request body must be JSON");
  }

  const name = (body?.name ?? "").trim();
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  const phone = (body?.phone ?? "").trim() || null;

  if (!name || name.length > 100) {
    return fail(400, "Enter your name (up to 100 characters).");
  }
  if (!EMAIL_RE.test(email) || email.length > 160) {
    return fail(400, "Enter a valid email address.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return fail(400, "Password must be at least 8 characters.");
  }
  if (phone && phone.length > 24) {
    return fail(400, "Phone number is too long.");
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("storefront_customers")
    .select("id")
    .eq("restaurant_id", auth.key.restaurantId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return fail(409, "An account with this email already exists. Please sign in.");
  }

  const passwordHash = await hashCustomerPassword(password);
  const { data: created, error } = await supabase
    .from("storefront_customers")
    .insert({
      restaurant_id: auth.key.restaurantId,
      email,
      name,
      phone,
      password_hash: passwordHash,
    })
    .select("id, restaurant_id, email, name, phone, created_at")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return fail(409, "An account with this email already exists. Please sign in.");
    }
    return fail(500, "Couldn't create customer account. Try again.");
  }

  const token = issueCustomerToken(created);
  return NextResponse.json(
    {
      customer: {
        id: created.id,
        email: created.email,
        name: created.name,
        phone: created.phone,
        created_at: created.created_at,
      },
      token,
    },
    { status: 201, headers: cors },
  );
}
