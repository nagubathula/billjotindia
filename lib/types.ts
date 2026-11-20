// Façade over the generated Supabase schema in lib/database.types.ts.
// Regenerate the generated file with:
//   npx supabase gen types typescript --linked > lib/database.types.ts
// Add hand-written narrowed unions (OrderStatus, OrderSource, …) and JSON
// shapes (ProductConfig) here — those are tighter than what Postgres knows.

import type { Database } from "./database.types";

export type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

// ---------- Table row aliases (auto-derived from the live schema) ----------
export type Brand                = Row<"brands">;
export type Restaurant           = Row<"restaurants">;
export type Outlet               = Row<"outlets">;
export type Category             = Row<"categories">;
export type CategorySubmenu      = Row<"category_submenus">;
export type CustomizationGroup   = Row<"customization_groups">;
export type CustomizationOption  = Row<"customization_options">;
export type Product              = Row<"products">;
export type ProductCustomization = Row<"product_customizations">;
export type SubmenuItem          = Row<"submenu_items">;
export type PromotionalBanner    = Row<"promotional_banners">;
export type Order                = Row<"orders">;
export type OrderItem            = Row<"order_items">;
export type PaymentSettings      = Row<"payment_settings">;
export type Profile              = Row<"profiles">;
export type UserRole             = Row<"user_roles">;
export type Printer              = Row<"printers">;
export type KitchenStation       = Row<"kitchen_stations">;
export type KotTicket            = Row<"kot_tickets">;
export type KotTicketItem        = Row<"kot_ticket_items">;
export type ChannelItemMapping   = Row<"channel_item_mappings">;
export type ChannelOutlet        = Row<"channel_outlets">;
export type ExternalOrderEvent   = Row<"external_order_events">;
export type HrEmployee           = Row<"hr_employees">;
export type HrAttendance         = Row<"hr_attendance">;
export type HrAdvance            = Row<"hr_advances">;
export type HrPayrollEntry       = Row<"hr_payroll_entries">;
export type Vendor               = Row<"vendors">;
export type VendorPurchaseOrder  = Row<"vendor_purchase_orders">;
export type VendorPayment        = Row<"vendor_payments">;
export type Coupon               = Row<"coupons">;
export type CustomerTab          = Row<"customer_tabs">;
export type CustomerTabTransaction = Row<"customer_tab_transactions">;
export type CorporateClient      = Row<"corporate_clients">;
export type CorporateInvoice     = Row<"corporate_invoices">;
export type OutletExpense        = Row<"outlet_expenses">;
export type TableBooking         = Row<"table_bookings">;
export type InventoryMaterial    = Row<"inventory_materials">;
export type ProductRecipe        = Row<"product_recipes">;
export type InventoryStockMovement = Row<"inventory_stock_movements">;
export type RegisterShift        = Row<"register_shifts">;
export type OrderPayment         = Row<"order_payments">;

// ---------- Narrowed unions (the DB columns are plain text/check-constrained) ----------
export type OrderPaymentMode =
  | "open"
  | "cash"
  | "upi"
  | "card"
  | "razorpay"
  | "stripe"
  | "tab"
  | "online"
  | "split"
  | "aggregator";

export type BookingType = "reservation" | "waitlist";

export type BookingStatus =
  | "pending_payment"
  | "pending"
  | "confirmed"
  | "waitlisted"
  | "notified"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

export type DepositStatus =
  | "none"
  | "pending"
  | "paid"
  | "refunded"
  | "waived";

export type AppRole = "admin" | "user" | "manager" | "captain";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type OrderSource =
  | "pos"
  | "kiosk"
  | "web"
  | "zomato"
  | "swiggy"
  | "magicpin"
  | "dunzo"
  | "ondc"
  | "uber-eats"
  | "dotpe"
  | "other";

export type AggregatorChannel = Exclude<OrderSource, "pos" | "kiosk" | "web">;

export type KotTicketStatus =
  | "queued"
  | "printing"
  | "printed"
  | "acknowledged"
  | "ready"
  | "served"
  | "void";

// ---------- JSON shapes (stored in jsonb columns, opaque to Postgres) ----------
export type ProductConfig = {
  product_id: string;
  name: string;
  base_price: number;
  selected_options?: Array<{
    group_id: string;
    group_name: string;
    option_id: string;
    option_name: string;
    price: number;
    quantity?: number;
    unit_price?: number;
    veg_status?: string;
  }>;
};
