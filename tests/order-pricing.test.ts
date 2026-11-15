import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanNote,
  isOrderType,
  recomputeFirstParty,
  resolveTableForOrder,
  splitGst,
} from "@/lib/order-pricing";
import type { createAdminClient } from "@/lib/supabase/admin";

type MockCatalog = {
  products: Array<{
    id: string;
    outlet_id: string;
    name: string;
    price: number;
    gst_rate: number;
    hsn_code: string | null;
    status: string;
  }>;
  links: Array<{ product_id: string; group_id: string }>;
  groups: Array<{
    id: string;
    name: string;
    display_name: string;
    selection_type: "single" | "multi";
    is_required: boolean;
    status: string;
  }>;
  options: Array<{
    id: string;
    group_id: string;
    name: string;
    price: number;
    status: string;
  }>;
  tabs?: Array<{ id: string; outlet_id: string; name: string }>;
};

function makeMockSupabase(
  catalog: MockCatalog,
): ReturnType<typeof createAdminClient> {
  function queryFor(table: keyof MockCatalog) {
    const rows = (catalog[table] ?? []) as Array<Record<string, unknown>>;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals);
        filters.push((r) => set.has(r[col]));
        return builder;
      },
      async maybeSingle() {
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        return { data: matched[0] ?? null, error: null };
      },
      then(
        onFulfilled: (v: { data: unknown[]; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        const matched = rows.filter((r) => filters.every((fn) => fn(r)));
        return Promise.resolve({ data: matched, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "product_customizations") return queryFor("links");
      if (table === "customization_groups") return queryFor("groups");
      if (table === "customization_options") return queryFor("options");
      if (table === "pos_tabs") return queryFor("tabs");
      return queryFor("products");
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";
const PROD_BIRYANI = "22222222-2222-4222-8222-222222222222";
const PROD_INACTIVE = "33333333-3333-4333-8333-333333333333";
const GRP_SPICE = "44444444-4444-4444-8444-444444444444";
const GRP_EXTRAS = "55555555-5555-4555-8555-555555555555";
const OPT_MEDIUM = "66666666-6666-4666-8666-666666666666";
const OPT_FIERY = "77777777-7777-4777-8777-777777777777";
const OPT_GHEE = "88888888-8888-4888-8888-888888888888";
const OPT_EGG = "99999999-9999-4999-8999-999999999999";
const TAB_T07 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const BASE_CATALOG: MockCatalog = {
  products: [
    {
      id: PROD_BIRYANI,
      outlet_id: OUTLET_ID,
      name: "Kodi Pulao",
      price: 315, // 300 + 5% GST inclusive
      gst_rate: 5,
      hsn_code: "996331",
      status: "active",
    },
    {
      id: PROD_INACTIVE,
      outlet_id: OUTLET_ID,
      name: "Seasonal Halwa",
      price: 150,
      gst_rate: 5,
      hsn_code: null,
      status: "inactive",
    },
  ],
  links: [
    { product_id: PROD_BIRYANI, group_id: GRP_SPICE },
    { product_id: PROD_BIRYANI, group_id: GRP_EXTRAS },
  ],
  groups: [
    {
      id: GRP_SPICE,
      name: "spice",
      display_name: "Spice Level",
      selection_type: "single",
      is_required: true,
      status: "active",
    },
    {
      id: GRP_EXTRAS,
      name: "extras",
      display_name: "Add-ons",
      selection_type: "multi",
      is_required: false,
      status: "active",
    },
  ],
  options: [
    { id: OPT_MEDIUM, group_id: GRP_SPICE, name: "Medium", price: 0, status: "active" },
    { id: OPT_FIERY, group_id: GRP_SPICE, name: "Guntur Fiery", price: 10, status: "active" },
    { id: OPT_GHEE, group_id: GRP_EXTRAS, name: "Extra Cow Ghee", price: 30, status: "active" },
    { id: OPT_EGG, group_id: GRP_EXTRAS, name: "Boiled Egg", price: 20, status: "active" },
  ],
  tabs: [
    {
      id: TAB_T07,
      outlet_id: OUTLET_ID,
      name: "T-07 · Ground Main Hall · 4p",
    },
  ],
};

test("isOrderType accepts only canonical order types", () => {
  assert.equal(isOrderType("dine-in"), true);
  assert.equal(isOrderType("takeaway"), true);
  assert.equal(isOrderType("delivery"), true);
  assert.equal(isOrderType("dine_in"), false);
  assert.equal(isOrderType("drive-thru"), false);
  assert.equal(isOrderType(null), false);
});

test("splitGst & cleanNote compute inclusive GST and bound notes", () => {
  const gst = splitGst(105, 5);
  assert.equal(Math.round(gst * 100) / 100, 5);
  assert.equal(cleanNote("   less spicy   ", 20), "less spicy");
  assert.equal(cleanNote("   ", 20), null);
  assert.equal(cleanNote("abcdef", 3), "abc");
});

test("recomputeFirstParty ignores client price spoofing and splits GST + coupon", async () => {
  const sb = makeMockSupabase(BASE_CATALOG);
  const res = await recomputeFirstParty(
    sb,
    OUTLET_ID,
    [
      {
        quantity: 2,
        unit_price: 1, // spoofed low price from client
        total_price: 2,
        instructions: "  extra onions  ",
        product_config: {
          product_id: PROD_BIRYANI,
          selected_options: [
            { option_id: OPT_MEDIUM },
            { option_id: OPT_GHEE },
          ],
        },
      },
    ],
    15, // takeaway packing
    0,
    0,
    "WELCOME50", // ₹50 off above ₹299
  );

  assert.equal(res.ok, true);
  if (!res.ok) return;
  // Unit = 315 + 0 + 30 = 345; 2 qty = 690 (GST-inclusive); 5% GST = 32.86 -> taxable subtotal = 657.14
  assert.equal(res.totals.subtotal, 657.14);
  assert.equal(res.totals.discount_amount, 50);
  assert.equal(res.totals.takeaway_charges, 15);
  assert.equal(res.totals.total_amount, 655);
  assert.equal(res.totals.items[0].unit_price, 345);
  assert.equal(res.totals.items[0].total_price, 690);
  assert.equal(res.totals.items[0].instructions, "extra onions");
  // 5% inclusive GST on 690 = 32.857... -> cgst 16.43, sgst 16.43
  assert.equal(res.totals.cgst, 16.43);
  assert.equal(res.totals.sgst, 16.43);
});

test("recomputeFirstParty enforces required, single-select, and duplicate add-on rules", async () => {
  const sb = makeMockSupabase(BASE_CATALOG);

  // 1. Missing required "Spice Level"
  const missingReq = await recomputeFirstParty(
    sb,
    OUTLET_ID,
    [
      {
        quantity: 1,
        unit_price: 315,
        total_price: 315,
        product_config: { product_id: PROD_BIRYANI, selected_options: [] },
      },
    ],
    0,
  );
  assert.equal(missingReq.ok, false);
  if (!missingReq.ok) {
    assert.match(missingReq.error, /Choose "Spice Level"/);
  }

  // 2. Picking two options in single-select "Spice Level"
  const tooManySingle = await recomputeFirstParty(
    sb,
    OUTLET_ID,
    [
      {
        quantity: 1,
        unit_price: 315,
        total_price: 315,
        product_config: {
          product_id: PROD_BIRYANI,
          selected_options: [
            { option_id: OPT_MEDIUM },
            { option_id: OPT_FIERY },
          ],
        },
      },
    ],
    0,
  );
  assert.equal(tooManySingle.ok, false);
  if (!tooManySingle.ok) {
    assert.match(tooManySingle.error, /Choose only one "Spice Level"/);
  }

  // 3. Duplicate option ID in multi-select group
  const duplicateOpt = await recomputeFirstParty(
    sb,
    OUTLET_ID,
    [
      {
        quantity: 1,
        unit_price: 315,
        total_price: 315,
        product_config: {
          product_id: PROD_BIRYANI,
          selected_options: [
            { option_id: OPT_MEDIUM },
            { option_id: OPT_GHEE },
            { option_id: OPT_GHEE },
          ],
        },
      },
    ],
    0,
  );
  assert.equal(duplicateOpt.ok, false);
  if (!duplicateOpt.ok) {
    assert.match(duplicateOpt.error, /twice/);
  }

  // 4. Inactive product rejected
  const inactiveProd = await recomputeFirstParty(
    sb,
    OUTLET_ID,
    [
      {
        quantity: 1,
        unit_price: 150,
        total_price: 150,
        product_config: { product_id: PROD_INACTIVE },
      },
    ],
    0,
  );
  assert.equal(inactiveProd.ok, false);
});

test("resolveTableForOrder resolves by UUID, table_code, and customerName prefix", async () => {
  const sb = makeMockSupabase(BASE_CATALOG);

  const byUuid = await resolveTableForOrder(sb, OUTLET_ID, {
    tableId: TAB_T07,
  });
  assert.equal(byUuid, TAB_T07);

  const byCode = await resolveTableForOrder(sb, OUTLET_ID, {
    tableCode: "t-07",
  });
  assert.equal(byCode, TAB_T07);

  const byCustomerPrefix = await resolveTableForOrder(sb, OUTLET_ID, {
    customerName: "T-07 · Asha",
  });
  assert.equal(byCustomerPrefix, TAB_T07);

  const wrongOutlet = await resolveTableForOrder(
    sb,
    "00000000-0000-4000-8000-000000000000",
    { tableId: TAB_T07 },
  );
  assert.equal(wrongOutlet, null);
});
