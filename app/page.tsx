import { redirect } from "next/navigation";
import { getCurrentUser, resolveDefaultHome } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RootEntryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  redirect(await resolveDefaultHome());
}
