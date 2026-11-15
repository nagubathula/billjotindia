"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSafeInternalNext, resolveDefaultHome } from "@/lib/auth";

type State = { error?: string } | null;

export async function signInAction(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");

  if (isSafeInternalNext(requestedNext)) {
    redirect(requestedNext);
  }

  redirect(await resolveDefaultHome());
}
