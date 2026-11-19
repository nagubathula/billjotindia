export type VegStatus = "Veg" | "Egg" | "Non-Veg";

export const QUICK_PREP_TAGS = [
  "Less Spicy",
  "Extra Spicy",
  "Jain",
  "No Onion/Garlic",
  "Less Oil",
  "Extra Hot",
] as const;

export type ModifierOptionData = {
  id: string;
  group_id: string;
  name: string;
  price: number;
  veg_status?: string | null;
  is_default?: boolean | null;
  max_qty?: number | null;
  variant_prices?: unknown;
  status?: string | null;
  sort_order?: number | null;
};

export type ModifierGroupData = {
  id: string;
  name?: string | null;
  display_name: string;
  selection_type: string;
  is_required?: boolean | null;
  min_selections?: number | null;
  max_selections?: number | null;
  free_selections?: number | null;
  status?: string | null;
  sort_order?: number | null;
};

export type ProductModifierEntry = {
  group: ModifierGroupData;
  options: ModifierOptionData[];
  sort_order: number;
  is_required_override?: boolean | null;
};

export type ProductModifiersPayload = {
  groups: ProductModifierEntry[];
};

export type ResolvedGroupRules = {
  isSingle: boolean;
  required: boolean;
  min: number;
  max: number | null;
  freeSelections: number;
};

export type EvaluatedSelectedOption = {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  /** Total charge contributed by this option selection for 1 unit of the product (after variant pricing & free allowance). */
  price: number;
  /** Present when > 1 (omitted when 1 for backwards compatibility). */
  quantity?: number;
  unit_price?: number;
  veg_status?: VegStatus;
};

export type CustomizationEvalResult =
  | {
      ok: true;
      selectedOptions: EvaluatedSelectedOption[];
      optionsTotal: number;
    }
  | {
      ok: false;
      error: string;
    };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function normalizeVegStatus(value: unknown): VegStatus {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "egg") return "Egg";
  if (s === "non-veg" || s === "nonveg" || s === "non veg") return "Non-Veg";
  return "Veg";
}

export function parseVariantPrices(raw: unknown): Record<string, number> {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = k.trim();
    const num = Number(v);
    if (key && Number.isFinite(num) && num >= 0) {
      out[key] = round2(num);
    }
  }
  return out;
}

export function resolveGroupRules(
  group: ModifierGroupData,
  isRequiredOverride?: boolean | null,
): ResolvedGroupRules {
  const isSingle = group.selection_type === "single";
  const rawMin = Math.max(0, Math.floor(Number(group.min_selections ?? 0)));
  const required =
    typeof isRequiredOverride === "boolean"
      ? isRequiredOverride
      : Boolean(group.is_required || rawMin > 0);
  const min = !required ? 0 : isSingle ? 1 : Math.max(1, rawMin);
  const rawMax =
    group.max_selections != null && Number.isFinite(Number(group.max_selections))
      ? Math.max(1, Math.floor(Number(group.max_selections)))
      : null;
  const max = isSingle ? 1 : rawMax !== null ? Math.max(min, rawMax) : null;
  const freeSelections = Math.max(
    0,
    Math.floor(Number(group.free_selections ?? 0)),
  );
  return { isSingle, required, min, max, freeSelections };
}

export function formatGroupRuleSummary(rules: ResolvedGroupRules): string {
  if (rules.isSingle) return "Pick 1";
  if (rules.min > 0 && rules.max !== null) {
    return rules.min === rules.max
      ? `Pick ${rules.min}`
      : `Pick ${rules.min}–${rules.max}`;
  }
  if (rules.min > 0) return `At least ${rules.min}`;
  if (rules.max !== null) return `Up to ${rules.max}`;
  return "Multiple";
}

export function collectActiveVariantKeys(
  entries: ProductModifierEntry[],
  selectedByGroup: ReadonlyMap<string, ReadonlyMap<string, number>>,
): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.group.selection_type !== "single") continue;
    const sel = selectedByGroup.get(entry.group.id);
    if (!sel || sel.size === 0) continue;
    for (const opt of entry.options) {
      if ((sel.get(opt.id) ?? 0) > 0) {
        keys.add(opt.id);
        const lowerName = opt.name.trim().toLowerCase();
        if (lowerName) keys.add(lowerName);
      }
    }
  }
  return keys;
}

export function resolveOptionUnitPrice(
  option: ModifierOptionData,
  activeVariantKeys: ReadonlySet<string>,
): number {
  const map = parseVariantPrices(option.variant_prices);
  for (const [k, price] of Object.entries(map)) {
    if (activeVariantKeys.has(k) || activeVariantKeys.has(k.toLowerCase())) {
      return price;
    }
  }
  return Math.max(0, round2(Number(option.price) || 0));
}

export function evaluateProductCustomizations(
  productName: string,
  entries: ProductModifierEntry[],
  rawSelections: Array<{ option_id?: unknown; quantity?: unknown }>,
): CustomizationEvalResult {
  const sortedEntries = [...entries].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const entryByGroupId = new Map<string, ProductModifierEntry>();
  const optById = new Map<string, { entry: ProductModifierEntry; opt: ModifierOptionData }>();

  for (const entry of sortedEntries) {
    entryByGroupId.set(entry.group.id, entry);
    for (const opt of entry.options) {
      optById.set(opt.id, { entry, opt });
    }
  }

  const seenOptions = new Set<string>();
  const selectedByGroup = new Map<string, Map<string, number>>();
  const totalUnitsPerGroup = new Map<string, number>();

  for (const sel of rawSelections) {
    const optId = typeof sel?.option_id === "string" ? sel.option_id : "";
    const found = optId ? optById.get(optId) : undefined;
    if (!found) {
      return { ok: false, error: `Invalid option on "${productName}"` };
    }
    const { entry, opt } = found;
    if (seenOptions.has(opt.id)) {
      return {
        ok: false,
        error: `"${opt.name}" is on "${productName}" twice`,
      };
    }

    const rawQty = sel?.quantity;
    if (rawQty !== undefined && rawQty !== null) {
      const parsedQty = Number(rawQty);
      if (!Number.isFinite(parsedQty) || parsedQty < 1 || !Number.isInteger(parsedQty)) {
        return { ok: false, error: `Invalid option on "${productName}"` };
      }
    }
    const qty =
      rawQty === undefined || rawQty === null
        ? 1
        : Math.max(1, Math.floor(Number(rawQty)));

    const rules = resolveGroupRules(entry.group, entry.is_required_override);
    const label = entry.group.display_name || entry.group.name || "options";
    const maxQty = rules.isSingle
      ? 1
      : Math.max(1, Math.floor(Number(opt.max_qty ?? 1)));

    if (qty > maxQty) {
      return {
        ok: false,
        error: rules.isSingle
          ? `Choose only one "${label}" for "${productName}"`
          : `Maximum ${maxQty} allowed for "${opt.name}" on "${productName}"`,
      };
    }

    seenOptions.add(opt.id);
    let grpMap = selectedByGroup.get(entry.group.id);
    if (!grpMap) {
      grpMap = new Map<string, number>();
      selectedByGroup.set(entry.group.id, grpMap);
    }
    grpMap.set(opt.id, qty);
    totalUnitsPerGroup.set(
      entry.group.id,
      (totalUnitsPerGroup.get(entry.group.id) ?? 0) + qty,
    );
  }

  // Validate group-level rules (required, single-select, min/max selections)
  for (const entry of sortedEntries) {
    const rules = resolveGroupRules(entry.group, entry.is_required_override);
    const label = entry.group.display_name || entry.group.name || "options";
    const totalPicked = totalUnitsPerGroup.get(entry.group.id) ?? 0;
    const hasOptions = entry.options.length > 0;

    if (rules.isSingle && totalPicked > 1) {
      return {
        ok: false,
        error: `Choose only one "${label}" for "${productName}"`,
      };
    }
    if (hasOptions && totalPicked < rules.min) {
      return {
        ok: false,
        error:
          rules.min === 1
            ? `Choose "${label}" for "${productName}"`
            : `Choose at least ${rules.min} in "${label}" for "${productName}"`,
      };
    }
    if (rules.max !== null && totalPicked > rules.max) {
      return {
        ok: false,
        error: `Choose at most ${rules.max} in "${label}" for "${productName}"`,
      };
    }
  }

  // Compute variant-adjusted prices + free allowance waivers
  const activeVariantKeys = collectActiveVariantKeys(sortedEntries, selectedByGroup);
  const selectedOptions: EvaluatedSelectedOption[] = [];
  let optionsTotal = 0;

  for (const entry of sortedEntries) {
    const grpSel = selectedByGroup.get(entry.group.id);
    if (!grpSel || grpSel.size === 0) continue;

    const rules = resolveGroupRules(entry.group, entry.is_required_override);
    const groupLabel = entry.group.display_name || entry.group.name || "Options";
    const sortedOpts = [...entry.options]
      .filter((o) => grpSel.has(o.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const unitPrices = new Map<string, number>();
    const paidTokens: Array<{ optionId: string; unitPrice: number }> = [];

    for (const opt of sortedOpts) {
      const qty = grpSel.get(opt.id) ?? 1;
      const unitPrice = resolveOptionUnitPrice(opt, activeVariantKeys);
      unitPrices.set(opt.id, unitPrice);
      if (rules.freeSelections > 0 && unitPrice > 0) {
        for (let i = 0; i < qty; i += 1) {
          paidTokens.push({ optionId: opt.id, unitPrice });
        }
      }
    }

    const totalChargeByOption = new Map<string, number>();
    if (rules.freeSelections > 0) {
      // Waive cheapest paid units first without wasting allowance on ₹0 items
      paidTokens.sort((a, b) => a.unitPrice - b.unitPrice);
      const waiveCount = Math.min(rules.freeSelections, paidTokens.length);
      for (let i = waiveCount; i < paidTokens.length; i += 1) {
        const tok = paidTokens[i];
        totalChargeByOption.set(
          tok.optionId,
          round2((totalChargeByOption.get(tok.optionId) ?? 0) + tok.unitPrice),
        );
      }
    }

    for (const opt of sortedOpts) {
      const qty = grpSel.get(opt.id) ?? 1;
      const unitPrice = unitPrices.get(opt.id) ?? 0;
      const effectivePrice =
        rules.freeSelections > 0
          ? round2(totalChargeByOption.get(opt.id) ?? 0)
          : round2(unitPrice * qty);

      optionsTotal = round2(optionsTotal + effectivePrice);
      const vegStatus = normalizeVegStatus(opt.veg_status);
      const row: EvaluatedSelectedOption = {
        group_id: entry.group.id,
        group_name: groupLabel,
        option_id: opt.id,
        option_name: opt.name,
        price: effectivePrice,
      };
      if (qty > 1) row.quantity = qty;
      if (unitPrice !== effectivePrice || qty > 1) row.unit_price = unitPrice;
      if (vegStatus !== "Veg") row.veg_status = vegStatus;
      selectedOptions.push(row);
    }
  }

  return {
    ok: true,
    selectedOptions,
    optionsTotal: round2(optionsTotal),
  };
}

export function buildModifierConfigKey(
  productId: string,
  selectedOptions: unknown,
): string {
  const tokens = Array.isArray(selectedOptions)
    ? selectedOptions
        .map((o) => {
          if (!o || typeof o !== "object") return "";
          const obj = o as { option_id?: unknown; quantity?: unknown };
          const id = String(obj.option_id ?? "").trim();
          if (!id) return "";
          const qty = Math.max(1, Math.floor(Number(obj.quantity ?? 1) || 1));
          return qty > 1 ? `${id}x${qty}` : id;
        })
        .filter(Boolean)
        .sort()
    : [];
  return tokens.length > 0 ? `p${productId}:${tokens.join("-")}` : `p${productId}`;
}

export function formatSelectedOptionLabel(opt: {
  option_name?: string | null;
  quantity?: number | null;
}): string {
  const name = opt.option_name ?? "";
  const qty = Math.max(1, Math.floor(Number(opt.quantity ?? 1) || 1));
  return qty > 1 ? `${name} ×${qty}` : name;
}

export function togglePrepTagInNote(currentNote: string, tag: string): string {
  const trimmedTag = tag.trim();
  if (!trimmedTag) return currentNote;
  const parts = currentNote
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const exists = parts.some(
    (p) => p.toLowerCase() === trimmedTag.toLowerCase(),
  );
  const next = exists
    ? parts.filter((p) => p.toLowerCase() !== trimmedTag.toLowerCase())
    : [...parts, trimmedTag];
  return next.join(", ");
}

export function buildModifiersByProductMap(params: {
  links: Array<{
    product_id: string;
    group_id: string;
    sort_order?: number | null;
    is_required_override?: boolean | null;
  }>;
  groups: ModifierGroupData[];
  options: ModifierOptionData[];
}): Record<string, ProductModifiersPayload> {
  const groupById = new Map<string, ModifierGroupData>();
  for (const g of params.groups) {
    if (g.status && g.status !== "active") continue;
    groupById.set(g.id, g);
  }

  const optsByGroup = new Map<string, ModifierOptionData[]>();
  for (const o of params.options) {
    if (o.status && o.status !== "active") continue;
    if (!groupById.has(o.group_id)) continue;
    const arr = optsByGroup.get(o.group_id) ?? [];
    arr.push(o);
    optsByGroup.set(o.group_id, arr);
  }
  for (const arr of optsByGroup.values()) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const sortedLinks = [...params.links].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const map: Record<string, ProductModifiersPayload> = {};
  for (const l of sortedLinks) {
    const group = groupById.get(l.group_id);
    if (!group) continue;
    const bucket = (map[l.product_id] ??= { groups: [] });
    bucket.groups.push({
      group,
      options: optsByGroup.get(l.group_id) ?? [],
      sort_order: l.sort_order ?? 0,
      is_required_override: l.is_required_override ?? null,
    });
  }

  return map;
}
