"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOpeningHours, type OpeningHours } from "@/lib/opening-hours";
import { saveOutletGatewayConfig } from "@/lib/payments";

type Result = { ok: true } | { ok: false; error: string };

export async function updateOutletAction(
  slug: string,
  outletId: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();

  // Defence: outlet must belong to this restaurant.
  const { data: existing } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!existing || existing.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet not in this restaurant." };
  }

  // Blank = the outlet doesn't keep fixed hours (stored as NULL).
  let openingHours: OpeningHours | null = null;
  const rawHours = String(formData.get("opening_hours") ?? "");
  if (rawHours) {
    try {
      openingHours = parseOpeningHours(JSON.parse(rawHours));
    } catch {
      openingHours = null;
    }
    if (!openingHours) {
      return {
        ok: false,
        error: "Check the opening hours: each row needs an opening and a closing time that differ.",
      };
    }
  }

  const payload = {
    opening_hours: openingHours,
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    state_code: String(formData.get("state_code") ?? "").trim() || null,
    pincode: String(formData.get("pincode") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    fssai_license: String(formData.get("fssai_license") ?? "").trim() || null,
  };
  if (!payload.name) return { ok: false, error: "Outlet name is required." };

  const { error } = await admin.from("outlets").update(payload).eq("id", outletId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/settings`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

// Normalize user input to a bare lowercase hostname, or null when blank.
// Accepts "https://Order.Cafe.com/", "order.cafe.com:443", etc.
function normalizeDomain(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^https?:\/\//, ""); // strip scheme
  host = host.split("/")[0]; // strip path
  host = host.split(":")[0]; // strip port
  host = host.replace(/\.$/, ""); // strip trailing dot
  return host || null;
}

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function updateCustomDomainAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  // Custom domain is a sensitive routing setting — admins only.
  await requireRole(["admin"], { restaurantId: restaurant.id });

  const domain = normalizeDomain(String(formData.get("custom_domain") ?? ""));
  if (domain && !DOMAIN_RE.test(domain)) {
    return {
      ok: false,
      error: "Enter a valid domain like order.yourcafe.com (no http://).",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurants")
    .update({ custom_domain: domain })
    .eq("id", restaurant.id);

  if (error) {
    // 23505 = unique_violation: another restaurant already claimed it.
    if (error.code === "23505") {
      return { ok: false, error: "That domain is already in use by another restaurant." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/r/${slug}/admin/settings`);
  return { ok: true };
}

export async function updatePaymentGatewaysAction(
  slug: string,
  outletId: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  // Payment gateway credentials are admin-only
  await requireRole(["admin"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!existing || existing.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const res = await saveOutletGatewayConfig(outletId, {
    codEnabled: formData.get("cod_enabled") === "on",
    onlineEnabled: formData.get("online_enabled") === "on",
    razorpayEnabled: formData.get("razorpay_enabled") === "on",
    razorpayKeyId: String(formData.get("razorpay_key_id") ?? ""),
    razorpayKeySecret: String(formData.get("razorpay_key_secret") ?? ""),
    razorpayWebhookSecret: String(formData.get("razorpay_webhook_secret") ?? ""),
    stripeEnabled: formData.get("stripe_enabled") === "on",
    stripePublishableKey: String(formData.get("stripe_publishable_key") ?? ""),
    stripeSecretKey: String(formData.get("stripe_secret_key") ?? ""),
    stripeWebhookSecret: String(formData.get("stripe_webhook_secret") ?? ""),
    upiVpa: String(formData.get("upi_vpa") ?? ""),
  });

  if (!res.ok) return res;

  revalidatePath(`/r/${slug}/admin/settings`);
  revalidatePath(`/r/${slug}/checkout`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

function revalidateHardwarePaths(slug: string) {
  revalidatePath(`/r/${slug}/admin/settings`);
  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/admin/kitchen`);
  revalidatePath(`/r/${slug}/kitchen`);
  revalidatePath(`/r/${slug}/pos`);
}

export async function savePrinterAction(
  slug: string,
  outletId: string,
  input: {
    id?: string;
    name: string;
    purpose: "kot" | "bill" | "label" | "customer_display";
    interfaceType: "network" | "usb" | "bluetooth" | "cloud";
    address?: string;
    paperWidth: 58 | 80 | 110;
    kickCashDrawer: boolean;
  },
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter a printer name." };

  const payload = {
    outlet_id: outletId,
    name: name.slice(0, 80),
    purpose: input.purpose,
    interface: input.interfaceType,
    address: input.address?.trim() || null,
    paper_width: input.paperWidth === 58 ? 58 : input.paperWidth === 110 ? 110 : 80,
    kick_cash_drawer: Boolean(input.kickCashDrawer),
    status: "active",
  };

  const { error } = input.id
    ? await admin
        .from("printers")
        .update(payload)
        .eq("id", input.id)
        .eq("outlet_id", outletId)
    : await admin.from("printers").insert(payload);

  if (error) return { ok: false, error: error.message };
  revalidateHardwarePaths(slug);
  return { ok: true };
}

export async function deletePrinterAction(
  slug: string,
  outletId: string,
  printerId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const { error } = await admin
    .from("printers")
    .delete()
    .eq("id", printerId)
    .eq("outlet_id", outletId);
  if (error) return { ok: false, error: error.message };

  revalidateHardwarePaths(slug);
  return { ok: true };
}

export async function saveKitchenStationAction(
  slug: string,
  outletId: string,
  input: {
    id?: string;
    name: string;
    printerId?: string | null;
    sortOrder?: number;
  },
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter a station name." };

  const payload = {
    outlet_id: outletId,
    name: name.slice(0, 60),
    printer_id: input.printerId?.trim() || null,
    sort_order: Math.max(0, Math.floor(Number(input.sortOrder ?? 0) || 0)),
    status: "active",
  };

  const { error } = input.id
    ? await admin
        .from("kitchen_stations")
        .update(payload)
        .eq("id", input.id)
        .eq("outlet_id", outletId)
    : await admin.from("kitchen_stations").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Station "${name}" already exists in this outlet.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateHardwarePaths(slug);
  return { ok: true };
}

export async function deleteKitchenStationAction(
  slug: string,
  outletId: string,
  stationId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const { error } = await admin
    .from("kitchen_stations")
    .delete()
    .eq("id", stationId)
    .eq("outlet_id", outletId);
  if (error) return { ok: false, error: error.message };

  revalidateHardwarePaths(slug);
  return { ok: true };
}

export async function seedDefaultStationsAction(
  slug: string,
  outletId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const defaults = [
    { name: "Main Kitchen", sort_order: 10 },
    { name: "Tandoor & Grill", sort_order: 20 },
    { name: "Beverage & Bar", sort_order: 30 },
    { name: "Desserts", sort_order: 40 },
  ];

  const { error } = await admin.from("kitchen_stations").upsert(
    defaults.map((d) => ({
      outlet_id: outletId,
      name: d.name,
      sort_order: d.sort_order,
      status: "active",
    })),
    { onConflict: "outlet_id,name" },
  );

  if (error) return { ok: false, error: error.message };
  revalidateHardwarePaths(slug);
  return { ok: true };
}
