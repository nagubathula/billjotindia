import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /logout — sign out and redirect to /login. Use a POST form so it
// can't be triggered by a CSRF-vulnerable GET (image src, prefetch, etc.).
export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url, { status: 303 });
}
