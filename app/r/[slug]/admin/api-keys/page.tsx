import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeZone } from "@/lib/time";
import { isApiKeyScope } from "@/lib/api-keys";
import { ApiKeysManager, type ApiKeyRow } from "./ApiKeysManager";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ApiKeysPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  // Keys open the menu and ordering to outside apps: admins only.
  await requireRole(["admin"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/api-keys`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const outletName = new Map(outlets.map((o) => [o.id, o.name]));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("restaurant_api_keys")
    .select("id, name, key_prefix, outlet_id, scopes, created_at, last_used_at, revoked_at")
    .eq("restaurant_id", restaurant.id)
    .order("revoked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    });
  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });

  const keys: ApiKeyRow[] = (data ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.key_prefix,
    outlet: k.outlet_id ? (outletName.get(k.outlet_id) ?? "Removed outlet") : null,
    scopes: (k.scopes ?? []).filter(isApiKeyScope),
    created: date(k.created_at),
    lastUsed: k.last_used_at ? dateTime(k.last_used_at) : null,
    revoked: k.revoked_at ? date(k.revoked_at) : null,
  }));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <ApiKeysManager
      slug={params.slug}
      apiBase={`${proto}://${host}/api`}
      outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
      keys={keys}
      loadError={
        error
          ? "API keys couldn't be loaded. If this is a new install, the database migration for API keys may not be applied yet."
          : null
      }
    />
  );
}
