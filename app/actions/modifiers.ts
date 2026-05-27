"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  CustomizationGroup,
  CustomizationOption,
  ProductCustomization,
} from "@/lib/types";

export type ProductModifiers = {
  groups: Array<{
    group: CustomizationGroup;
    options: CustomizationOption[];
    sort_order: number;
  }>;
};

/**
 * Returns the modifier groups + options for a product, in sort order.
 * Anon-readable via the anon client + RLS policies (active rows only).
 */
export async function getProductModifiers(
  productId: number,
): Promise<ProductModifiers> {
  const supabase = createClient();

  const { data: links } = await supabase
    .from("product_customizations")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order");

  const pcs = (links ?? []) as ProductCustomization[];
  if (pcs.length === 0) return { groups: [] };

  const groupIds = pcs.map((p) => p.group_id);

  const [{ data: groups }, { data: options }] = await Promise.all([
    supabase
      .from("customization_groups")
      .select("*")
      .in("id", groupIds)
      .eq("status", "active"),
    supabase
      .from("customization_options")
      .select("*")
      .in("group_id", groupIds)
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const groupsById = new Map(
    (groups ?? []).map((g) => [g.id, g as CustomizationGroup]),
  );
  const optsByGroup = new Map<number, CustomizationOption[]>();
  for (const o of (options ?? []) as CustomizationOption[]) {
    const arr = optsByGroup.get(o.group_id) ?? [];
    arr.push(o);
    optsByGroup.set(o.group_id, arr);
  }

  const result = pcs
    .map((p) => {
      const g = groupsById.get(p.group_id);
      if (!g) return null;
      return {
        group: g,
        options: optsByGroup.get(p.group_id) ?? [],
        sort_order: p.sort_order ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return { groups: result };
}
