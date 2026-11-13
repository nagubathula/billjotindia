"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { parseTableName } from "@/lib/tables";

export type CapacityPresetId = "12-table" | "300-seat" | "3000-seat";

function buildPresetTables(preset: CapacityPresetId): string[] {
  if (preset === "12-table") {
    return [
      "Table 01 · Main Hall · 2p",
      "Table 02 · Main Hall · 2p",
      "Table 03 · Main Hall · 4p",
      "Table 04 · Main Hall · 4p",
      "Table 05 · Main Hall · 4p",
      "Table 06 · Main Hall · 4p",
      "Table 07 · Main Hall · 6p",
      "Table 08 · Main Hall · 6p",
      "AC-01 · Family AC · 6p",
      "AC-02 · Family AC · 6p",
      "VIP-01 · VIP Cabin · 8p",
      "VIP-02 · VIP Cabin · 8p",
    ];
  }

  if (preset === "300-seat") {
    const list: string[] = [];
    // Ground Main Hall: 30 tables x 4 seats = 120 seats
    for (let i = 1; i <= 30; i++) {
      list.push(`T-${String(i).padStart(2, "0")} · Ground Main Hall · 4p`);
    }
    // 1st Floor Family AC: 20 tables x 4 seats = 80 seats
    for (let i = 1; i <= 20; i++) {
      list.push(`AC-${String(i).padStart(2, "0")} · 1st Floor Family AC · 4p`);
    }
    // Group & Bhojanam Hall: 10 tables x 6 seats = 60 seats
    for (let i = 1; i <= 10; i++) {
      list.push(`GH-${String(i).padStart(2, "0")} · Group & Bhojanam Hall · 6p`);
    }
    // Banquet & VIP Cabins: 5 tables x 8 seats = 40 seats
    for (let i = 1; i <= 5; i++) {
      list.push(`VIP-${String(i).padStart(2, "0")} · Banquet & VIP Cabins · 8p`);
    }
    // Total: 65 tables, 300 seats
    return list;
  }

  // 3000-seat Mega Hall / Convention / Food Court preset: 500 tables x 6 seats = 3,000 seats
  const mega: string[] = [];
  const halls = [
    { prefix: "HA", zone: "Hall A - Ground (600 Pax)", count: 100, seats: 6 },
    { prefix: "HB", zone: "Hall B - Ground (600 Pax)", count: 100, seats: 6 },
    { prefix: "HC", zone: "Hall C - 1st Floor AC (600 Pax)", count: 100, seats: 6 },
    { prefix: "HD", zone: "Hall D - Family Wing (600 Pax)", count: 100, seats: 6 },
    { prefix: "GB", zone: "Grand Banquet & Lawn (600 Pax)", count: 100, seats: 6 },
  ];
  for (const h of halls) {
    for (let i = 1; i <= h.count; i++) {
      mega.push(
        `${h.prefix}-${String(i).padStart(3, "0")} · ${h.zone} · ${h.seats}p`,
      );
    }
  }
  return mega;
}

async function verifyOutlet(slug: string, outletId: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });
  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) return null;
  return { restaurant, admin };
}

export async function createFloorTableAction(
  slug: string,
  outletId: string,
  code: string,
  zone: string,
  seats: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await verifyOutlet(slug, outletId);
  if (!ctx) return { ok: false, error: "Not authorized" };

  const cleanCode = code.trim();
  const cleanZone = zone.trim() || "Ground Main Hall";
  const cleanSeats = Math.max(1, Math.min(50, Number(seats) || 4));
  if (!cleanCode) return { ok: false, error: "Table name/code is required" };

  const fullName = `${cleanCode} · ${cleanZone} · ${cleanSeats}p`;

  const { error } = await ctx.admin.from("pos_tabs").insert({
    outlet_id: outletId,
    name: fullName,
    lines: [],
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

export async function bulkCreateTableRangeAction(
  slug: string,
  outletId: string,
  input: {
    prefix: string;
    startNum: number;
    endNum: number;
    zone: string;
    seats: number;
  },
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await verifyOutlet(slug, outletId);
  if (!ctx) return { ok: false, error: "Not authorized" };

  const cleanPrefix = (input.prefix || "T-").trim();
  const cleanZone = (input.zone || "Ground Main Hall").trim();
  const cleanSeats = Math.max(1, Math.min(50, Number(input.seats) || 4));
  const start = Math.max(1, Math.floor(Number(input.startNum) || 1));
  const end = Math.max(start, Math.floor(Number(input.endNum) || start));

  const count = end - start + 1;
  if (count > 600) {
    return {
      ok: false,
      error: "Please generate at most 600 tables per batch.",
    };
  }

  const padLen = end >= 100 ? 3 : 2;

  const { data: existing } = await ctx.admin
    .from("pos_tabs")
    .select("name")
    .eq("outlet_id", outletId);

  const existingCodes = new Set(
    (existing ?? []).map((r) => r.name.split("·")[0].trim().toLowerCase()),
  );

  const rows: Array<{ outlet_id: string; name: string; lines: never[] }> = [];
  for (let n = start; n <= end; n++) {
    const numStr = String(n).padStart(padLen, "0");
    const sep =
      cleanPrefix.endsWith("-") || cleanPrefix.endsWith(" ") ? "" : "-";
    const code = `${cleanPrefix}${sep}${numStr}`;
    if (existingCodes.has(code.toLowerCase())) continue;
    rows.push({
      outlet_id: outletId,
      name: `${code} · ${cleanZone} · ${cleanSeats}p`,
      lines: [],
    });
  }

  if (rows.length > 0) {
    // Insert in chunks of 200 for Supabase safety
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await ctx.admin.from("pos_tabs").insert(chunk);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, created: rows.length };
}

export async function applyCapacityPresetAction(
  slug: string,
  outletId: string,
  preset: CapacityPresetId,
  replaceEmptyTables = true,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await verifyOutlet(slug, outletId);
  if (!ctx) return { ok: false, error: "Not authorized" };

  const { data: existing } = await ctx.admin
    .from("pos_tabs")
    .select("id, name, lines")
    .eq("outlet_id", outletId);

  if (replaceEmptyTables && existing && existing.length > 0) {
    const emptyIds = existing
      .filter((r) => !Array.isArray(r.lines) || r.lines.length === 0)
      .map((r) => r.id);

    if (emptyIds.length > 0) {
      for (let i = 0; i < emptyIds.length; i += 200) {
        await ctx.admin
          .from("pos_tabs")
          .delete()
          .in("id", emptyIds.slice(i, i + 200));
      }
    }
  }

  const { data: remaining } = await ctx.admin
    .from("pos_tabs")
    .select("name")
    .eq("outlet_id", outletId);

  const existingPrefixes = new Set(
    (remaining ?? []).map((r) => r.name.split("·")[0].trim().toLowerCase()),
  );

  const targetNames = buildPresetTables(preset);
  const toInsert = targetNames
    .filter(
      (name) => !existingPrefixes.has(name.split("·")[0].trim().toLowerCase()),
    )
    .map((name) => ({
      outlet_id: outletId,
      name,
      lines: [],
    }));

  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await ctx.admin.from("pos_tabs").insert(chunk);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, created: toInsert.length };
}

export async function seedDefaultFloorPlanAction(
  slug: string,
  outletId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await applyCapacityPresetAction(slug, outletId, "300-seat", false);
  if (!res.ok) return res;
  return { ok: true };
}

export async function clearEmptyZoneTablesAction(
  slug: string,
  outletId: string,
  zone: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const ctx = await verifyOutlet(slug, outletId);
  if (!ctx) return { ok: false, error: "Not authorized" };

  const { data: existing } = await ctx.admin
    .from("pos_tabs")
    .select("id, name, lines")
    .eq("outlet_id", outletId);

  const idsToDelete = (existing ?? [])
    .filter((r) => {
      const isEmpty = !Array.isArray(r.lines) || r.lines.length === 0;
      if (!isEmpty) return false;
      if (zone === "all") return true;
      // Same parsing the floor board uses, so "remove empty tables in this
      // area" removes exactly the tables shown under that area.
      return parseTableName(r.name).zone === zone;
    })
    .map((r) => r.id);

  if (idsToDelete.length > 0) {
    for (let i = 0; i < idsToDelete.length; i += 200) {
      const { error } = await ctx.admin
        .from("pos_tabs")
        .delete()
        .in("id", idsToDelete.slice(i, i + 200));
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, deleted: idsToDelete.length };
}

export async function clearTableTabAction(
  slug: string,
  tabId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not found" };
  await requireRole(["admin", "manager", "user"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { error } = await admin
    .from("pos_tabs")
    .update({ lines: [], updated_at: new Date().toISOString() })
    .eq("id", tabId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

export async function deleteFloorTableAction(
  slug: string,
  tabId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not found" };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { error } = await admin.from("pos_tabs").delete().eq("id", tabId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}
