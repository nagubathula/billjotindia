"use server";

import { createClient as createSb } from "@supabase/supabase-js";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";

// Raw, untyped service-role client. `pos_tabs` isn't in the generated
// database.types yet (run scripts/create-pos-tabs.sql, then regenerate types),
// so we use an untyped client here to avoid coupling to codegen. Gating is done
// via requireRole, exactly like the orders API / status actions.
function rawAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env missing");
  return createSb(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TabLine = unknown; // opaque to the server; the POS owns the shape
export type PosTab = {
  id: string;
  name: string;
  lines: TabLine[];
  createdAt: number;
};

async function authRestaurant(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  await requireRole(["admin", "manager", "user"], {
    restaurantId: restaurant.id,
  });
  return restaurant;
}

async function outletInRestaurant(
  db: ReturnType<typeof rawAdmin>,
  outletId: number,
  restaurantId: number,
) {
  const { data } = await db
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  return !!data && data.restaurant_id === restaurantId;
}

export async function listTabsAction(
  slug: string,
  outletId: number,
): Promise<PosTab[]> {
  const restaurant = await authRestaurant(slug);
  if (!restaurant) return [];
  const db = rawAdmin();
  if (!(await outletInRestaurant(db, outletId, restaurant.id))) return [];

  const { data } = await db
    .from("pos_tabs")
    .select("id, name, lines, created_at")
    .eq("outlet_id", outletId)
    .order("created_at", { ascending: true });

  return (data ?? []).map(
    (r: { id: string; name: string; lines: unknown; created_at: string }) => ({
      id: r.id,
      name: r.name,
      lines: Array.isArray(r.lines) ? (r.lines as TabLine[]) : [],
      createdAt: new Date(r.created_at).getTime(),
    }),
  );
}

export async function createTabAction(
  slug: string,
  outletId: number,
  name: string,
): Promise<{ ok: true; tab: PosTab } | { ok: false; error: string }> {
  const restaurant = await authRestaurant(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  const db = rawAdmin();
  if (!(await outletInRestaurant(db, outletId, restaurant.id))) {
    return { ok: false, error: "Unknown outlet" };
  }

  const { data, error } = await db
    .from("pos_tabs")
    .insert({ outlet_id: outletId, name: name.trim() || "Tab", lines: [] })
    .select("id, name, lines, created_at")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create tab" };
  }
  return {
    ok: true,
    tab: {
      id: data.id,
      name: data.name,
      lines: [],
      createdAt: new Date(data.created_at).getTime(),
    },
  };
}

export async function saveTabAction(
  slug: string,
  tabId: string,
  name: string,
  lines: TabLine[],
): Promise<{ ok: boolean }> {
  const restaurant = await authRestaurant(slug);
  if (!restaurant) return { ok: false };
  const db = rawAdmin();

  // Ensure the tab's outlet belongs to this restaurant before writing.
  const { data: tab } = await db
    .from("pos_tabs")
    .select("outlet_id")
    .eq("id", tabId)
    .maybeSingle();
  if (!tab || !(await outletInRestaurant(db, tab.outlet_id, restaurant.id))) {
    return { ok: false };
  }

  const { error } = await db
    .from("pos_tabs")
    .update({ name: name.trim() || "Tab", lines, updated_at: new Date().toISOString() })
    .eq("id", tabId);
  return { ok: !error };
}

export async function deleteTabAction(
  slug: string,
  tabId: string,
): Promise<{ ok: boolean }> {
  const restaurant = await authRestaurant(slug);
  if (!restaurant) return { ok: false };
  const db = rawAdmin();

  const { data: tab } = await db
    .from("pos_tabs")
    .select("outlet_id")
    .eq("id", tabId)
    .maybeSingle();
  if (!tab || !(await outletInRestaurant(db, tab.outlet_id, restaurant.id))) {
    return { ok: false };
  }

  const { error } = await db.from("pos_tabs").delete().eq("id", tabId);
  return { ok: !error };
}
