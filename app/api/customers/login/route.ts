import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey } from "@/lib/api-keys";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  issueCustomerToken,
  verifyCustomerPassword,
} from "@/lib/storefront-customers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `customer-login:ip:${ip}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a minute." },
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

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Request body must be JSON");
  }

  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  if (!email || !password) {
    return fail(400, "Enter your email and password.");
  }

  const supabase = createAdminClient();
  const { data: customer } = await supabase
    .from("storefront_customers")
    .select("id, restaurant_id, email, name, phone, password_hash, created_at")
    .eq("restaurant_id", auth.key.restaurantId)
    .ilike("email", email)
    .maybeSingle();

  if (!customer) {
    return fail(401, "Invalid email or password.");
  }

  const valid = await verifyCustomerPassword(password, customer.password_hash);
  if (!valid) {
    return fail(401, "Invalid email or password.");
  }

  const token = issueCustomerToken(customer);
  return NextResponse.json(
    {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        created_at: customer.created_at,
      },
      token,
    },
    { headers: cors },
  );
}
