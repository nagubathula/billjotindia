// Staff roles, in one place. Every screen, server action and API route asks
// these helpers instead of listing role names itself, so adding a role or
// changing what one may do happens here.
//
//   admin    Owner. Everything, including staff, API keys and settings.
//   manager  Runs the restaurant: admin pages (except staff and API keys), POS.
//   user     Cashier: POS, including taking payment and discounts.
//   captain  Waiter: POS for tables only. Takes orders and sends them to the
//            kitchen; can't take payment, give discounts or open admin pages.

import type { AppRole } from "@/lib/types";

export const ROLES: AppRole[] = ["admin", "manager", "user", "captain"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
  captain: "Captain",
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: "Everything, including staff, API keys and settings.",
  manager: "Admin pages and the POS, but not staff or API keys.",
  user: "The POS: takes orders and payments.",
  captain: "Takes table orders in the POS and sends them to the kitchen. No payments or discounts.",
};

// Higher wins when someone has more than one role in a restaurant.
export const ROLE_PRECEDENCE: Record<AppRole, number> = {
  admin: 4,
  manager: 3,
  user: 2,
  captain: 1,
};

/** Roles that can open the POS. */
export const POS_ROLES: AppRole[] = ["admin", "manager", "user", "captain"];

/** Roles that can open the admin area. */
export const ADMIN_AREA_ROLES: AppRole[] = ["admin", "manager"];

/** Roles that can settle a bill: take payment, give discounts, round totals. */
export const BILLING_ROLES: AppRole[] = ["admin", "manager", "user"];

export function canOpenPos(role: AppRole | null | undefined): boolean {
  return !!role && POS_ROLES.includes(role);
}

export function canTakePayment(role: AppRole | null | undefined): boolean {
  return !!role && BILLING_ROLES.includes(role);
}

/** Whether the role may take walk-in / takeaway / delivery orders (Captains are table-only). */
export function canTakeNonTableOrders(role: AppRole | null | undefined): boolean {
  return !!role && BILLING_ROLES.includes(role);
}

/** Whether the role may void/remove items already sent to the kitchen. */
export function canVoidSentItems(role: AppRole | null | undefined): boolean {
  return !!role && ADMIN_AREA_ROLES.includes(role);
}

/** Whether the role may open the live Kitchen Display System (KDS). */
export function canOpenKitchenBoard(role: AppRole | null | undefined): boolean {
  return !!role && POS_ROLES.includes(role);
}

/** Admin pages and settings live in the admin area. */
export function canOpenAdmin(role: AppRole | null | undefined): boolean {
  return !!role && ADMIN_AREA_ROLES.includes(role);
}

/** Staff and API keys management require restaurant Admin. */
export function canManageStaff(role: AppRole | null | undefined): boolean {
  return role === "admin";
}

export function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/** The strongest of several roles, by ROLE_PRECEDENCE. */
export function strongestRole(roles: AppRole[]): AppRole | null {
  return roles.reduce<AppRole | null>(
    (best, r) => (!best || ROLE_PRECEDENCE[r] > ROLE_PRECEDENCE[best] ? r : best),
    null,
  );
}
