import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /callback?code=...&next=/
//
// Lands here from customer email-confirmation links (sent by supabase.auth.signUp).
// PKCE: ?code=... → exchangeCodeForSession → session cookie → redirect to ?next.
//
// Staff sign-in does NOT use this route — admins create staff accounts
// directly with passwords. See decision_auth_model in /memory.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", url.origin),
      303,
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      303,
    );
  }

  return NextResponse.redirect(new URL(next, url.origin), 303);
}
