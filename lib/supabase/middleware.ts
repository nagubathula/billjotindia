import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types";

// `rewriteUrl`, when present, internally serves a different path (used for
// subdomain → /r/<slug> tenant routing) while keeping the user-visible URL.
// We re-create the response on every cookie write so the rewrite and the
// refreshed session cookies always travel together.
export async function updateSession(request: NextRequest, rewriteUrl?: URL) {
  const makeResponse = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request })
      : NextResponse.next({ request });

  let response = makeResponse();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            if (value === "") {
              request.cookies.delete(name);
            } else {
              request.cookies.set(name, value);
            }
          });
          response = makeResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() refreshes an expired session (writing new cookies via setAll)
  // and verifies the JWT locally against the project's cached JWKS (ES256),
  // so a valid session costs no Auth round trip — unlike getUser(), which
  // called the Auth server on every request including link prefetches.
  // Server components still call getUser() for the authoritative check.
  await supabase.auth.getClaims();
  return response;
}
