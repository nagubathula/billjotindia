import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModifierConfigKey,
  evaluateProductCustomizations,
  formatGroupRuleSummary,
  formatSelectedOptionLabel,
  resolveGroupRules,
  togglePrepTagInNote,
  type ProductModifierEntry,
} from "@/lib/customizations";
import { recomputeFirstParty } from "@/lib/order-pricing";
import type { createAdminClient } from "@/lib/supabase/admin";

describe("Menu customization rules, variant pricing & allowances", () => {
  const ENTRY_SIZE: ProductModifierEntry = {
    sort_order: 10,
    group: {
      id: "grp-size",
      display_name: "Size",
      selection_type: "single",
      is_required: true,
      min_selections: 1,
      max_selections: 1,
      free_selections: 0,
    },
    options: [
      { id: "opt-reg", group_id: "grp-size", name: "Regular", price: 0, is_default: true },
      { id: "opt-lrg", group_id: "grp-size", name: "Large", price: 100 },
    ],
  };

  const ENTRY_TOPPINGS: ProductModifierEntry = {
    sort_order: 20,
    group: {
      id: "grp-top",
      display_name: "Toppings",
      selection_type: "multi",
      is_required: true,
      min_selections: 2,
      max_selections: 4,
      free_selections: 1,
    },
    options: [
      { id: "opt-onion", group_id: "grp-top", name: "Onion", price: 0, max_qty: 1 },
      {
        id: "opt-cheese",
        group_id: "grp-top",
        name: "Extra Cheese",
        price: 40,
        max_qty: 3,
        veg_status: "Veg",
        variant_prices: { Large: 70 },
      },
      {
        id: "opt-chicken",
        group_id: "grp-top",
        name: "Pepperoni",
        price: 60,
        max_qty: 2,
        veg_status: "Non-Veg",
        variant_prices: { "opt-lrg": 90 },
      },
    ],
  };

  it("resolves group rules with per-product overrides and formats summaries", () => {
    const reqRules = resolveGroupRules(ENTRY_TOPPINGS.group, null);
    assert.equal(reqRules.min, 2);
    assert.equal(reqRules.max, 4);
    assert.equal(reqRules.freeSelections, 1);
    assert.equal(formatGroupRuleSummary(reqRules), "Pick 2–4");

    const optOverride = resolveGroupRules(ENTRY_TOPPINGS.group, false);
    assert.equal(optOverride.required, false);
    assert.equal(optOverride.min, 0);
    assert.equal(formatGroupRuleSummary(optOverride), "Up to 4");

    const forcedSingle = resolveGroupRules(
      { id: "g", display_name: "Dip", selection_type: "single", is_required: false },
      true,
    );
    assert.equal(forcedSingle.required, true);
    assert.equal(forcedSingle.min, 1);
    assert.equal(formatGroupRuleSummary(forcedSingle), "Pick 1");
  });

  it("enforces min/max selections and max_qty steppers", () => {
    const tooFew = evaluateProductCustomizations("Pizza", [ENTRY_SIZE, ENTRY_TOPPINGS], [
      { option_id: "opt-reg" },
      { option_id: "opt-cheese", quantity: 1 },
    ]);
    assert.equal(tooFew.ok, false);
    if (!tooFew.ok) assert.match(tooFew.error, /at least 2/);

    const tooManyGroup = evaluateProductCustomizations(
      "Pizza",
      [ENTRY_SIZE, ENTRY_TOPPINGS],
      [
        { option_id: "opt-reg" },
        { option_id: "opt-cheese", quantity: 3 },
        { option_id: "opt-chicken", quantity: 2 },
      ],
    );
    assert.equal(tooManyGroup.ok, false);
    if (!tooManyGroup.ok) assert.match(tooManyGroup.error, /at most 4/);

    const tooManyOpt = evaluateProductCustomizations(
      "Pizza",
      [ENTRY_SIZE, ENTRY_TOPPINGS],
      [
        { option_id: "opt-reg" },
        { option_id: "opt-onion", quantity: 2 },
      ],
    );
    assert.equal(tooManyOpt.ok, false);
    if (!tooManyOpt.ok) assert.match(tooManyOpt.error, /Maximum 1 allowed/);
  });

  it("waives cheapest paid unit with free_selections without wasting slots on ₹0 options and applies variant pricing", () => {
    // Pick Regular (0), Onion (0), Extra Cheese x2 (40 each = 80), Pepperoni x1 (60).
    // free_selections = 1 must waive 1 cheapest PAID unit (₹40), leaving 40 + 60 = 100.
    const regularEval = evaluateProductCustomizations(
      "Pizza",
      [ENTRY_SIZE, ENTRY_TOPPINGS],
      [
        { option_id: "opt-reg" },
        { option_id: "opt-onion" },
        { option_id: "opt-cheese", quantity: 2 },
        { option_id: "opt-chicken", quantity: 1 },
      ],
    );
    assert.equal(regularEval.ok, true);
    if (!regularEval.ok) return;
    assert.equal(regularEval.optionsTotal, 100);
    const cheeseLine = regularEval.selectedOptions.find(
      (o) => o.option_id === "opt-cheese",
    );
    assert.equal(cheeseLine?.quantity, 2);
    assert.equal(cheeseLine?.price, 40);

    // Switch to Large (+100): Cheese becomes 70/ea (waive 1 -> 70), Pepperoni becomes 90 -> 100 + 70 + 90 = 260
    const largeEval = evaluateProductCustomizations(
      "Pizza",
      [ENTRY_SIZE, ENTRY_TOPPINGS],
      [
        { option_id: "opt-lrg" },
        { option_id: "opt-cheese", quantity: 2 },
        { option_id: "opt-chicken", quantity: 1 },
      ],
    );
    assert.equal(largeEval.ok, true);
    if (!largeEval.ok) return;
    assert.equal(largeEval.optionsTotal, 260);
    const pepLine = largeEval.selectedOptions.find(
      (o) => o.option_id === "opt-chicken",
    );
    assert.equal(pepLine?.veg_status, "Non-Veg");
  });

  it("toggles quick prep tags cleanly and formats quantity config keys & labels", () => {
    let note = togglePrepTagInNote("", "Jain");
    assert.equal(note, "Jain");
    note = togglePrepTagInNote(note, "Less Spicy");
    assert.equal(note, "Jain, Less Spicy");
    note = togglePrepTagInNote(note, "jain");
    assert.equal(note, "Less Spicy");

    assert.equal(
      buildModifierConfigKey("prod1", [
        { option_id: "opt-b", quantity: 2 },
        { option_id: "opt-a", quantity: 1 },
      ]),
      "pprod1:opt-a-opt-bx2",
    );
    assert.equal(
      formatSelectedOptionLabel({ option_name: "Extra Shot", quantity: 2 }),
      "Extra Shot ×2",
    );
    assert.equal(
      formatSelectedOptionLabel({ option_name: "Medium", quantity: 1 }),
      "Medium",
    );
  });

  it("recomputeFirstParty prices quantity multipliers, variant prices, free picks & required overrides end-to-end", async () => {
    const outletId = "11111111-1111-4111-8111-111111111111";
    const prodId = "22222222-2222-4222-8222-222222222222";
    const grpSize = "44444444-4444-4444-8444-444444444444";
    const grpAdd = "55555555-5555-4555-8555-555555555555";
    const optLarge = "66666666-6666-4666-8666-666666666666";
    const optCheese = "77777777-7777-4777-8777-777777777777";
    const optOlive = "88888888-8888-4888-8888-888888888888";

    const mockCatalog = {
      products: [
        {
          id: prodId,
          outlet_id: outletId,
          name: "Farmhouse Pizza",
          price: 250,
          gst_rate: 5,
          hsn_code: "996331",
          status: "active",
        },
      ],
      product_customizations: [
        {
          product_id: prodId,
          group_id: grpSize,
          sort_order: 10,
          is_required_override: null,
        },
        {
          product_id: prodId,
          group_id: grpAdd,
          sort_order: 20,
          is_required_override: true,
        },
      ],
      customization_groups: [
        {
          id: grpSize,
          name: "size",
          display_name: "Size",
          selection_type: "single",
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          free_selections: 0,
          sort_order: 10,
          status: "active",
        },
        {
          id: grpAdd,
          name: "toppings",
          display_name: "Toppings",
          selection_type: "multi",
          is_required: false,
          min_selections: 2,
          max_selections: 3,
          free_selections: 1,
          sort_order: 20,
          status: "active",
        },
      ],
      customization_options: [
        {
          id: optLarge,
          group_id: grpSize,
          name: "Large",
          price: 100,
          veg_status: "Veg",
          is_default: false,
          max_qty: 1,
          variant_prices: {},
          sort_order: 10,
          status: "active",
        },
        {
          id: optCheese,
          group_id: grpAdd,
          name: "Cheese",
          price: 40,
          veg_status: "Veg",
          is_default: false,
          max_qty: 2,
          variant_prices: { Large: 70 },
          sort_order: 10,
          status: "active",
        },
        {
          id: optOlive,
          group_id: grpAdd,
          name: "Olives",
          price: 30,
          veg_status: "Veg",
          is_default: false,
          max_qty: 1,
          variant_prices: { Large: 50 },
          sort_order: 20,
          status: "active",
        },
      ],
    };

    const sb = {
      from(table: keyof typeof mockCatalog) {
        const rows = mockCatalog[table] as Array<Record<string, unknown>>;
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
      },
    } as unknown as ReturnType<typeof createAdminClient>;

    // Large (100) + Cheese x2 (70+70=140) + Olives x1 (50) with 1 free pick -> waives cheapest (Olives ₹50)
    // Unit = 250 + 100 + 140 = 490
    const res = await recomputeFirstParty(
      sb,
      outletId,
      [
        {
          quantity: 1,
          unit_price: 490,
          total_price: 490,
          product_config: {
            product_id: prodId,
            selected_options: [
              { option_id: optLarge },
              { option_id: optCheese, quantity: 2 },
              { option_id: optOlive, quantity: 1 },
            ],
          },
        },
      ],
      0,
    );

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.totals.total_amount, 490);
    assert.equal(res.totals.items[0].unit_price, 490);
  });
});
