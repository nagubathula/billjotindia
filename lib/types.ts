export type AppRole = "admin" | "user" | "manager";

export type Outlet = {
  id: number;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  fssai_license: string | null;
  timezone: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: number;
  outlet_id: number;
  name: string;
  emoji: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CategorySubmenu = {
  id: number;
  category: string;
  submenu_category: string;
  display_name: string;
  selection_type: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CustomizationGroup = {
  id: number;
  outlet_id: number;
  name: string;
  display_name: string;
  selection_type: string;
  is_required: boolean;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CustomizationOption = {
  id: number;
  group_id: number;
  name: string;
  price: number;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: number;
  outlet_id: number;
  name: string;
  category: string;
  type: string | null;
  price: number;
  status: string;
  veg_status: string;
  code: string | null;
  has_toppings: boolean;
  image_url: string | null;
  has_addons: boolean;
  description: string | null;
  gst_rate: number;
  hsn_code: string | null;
  sku: string | null;
  station_id: number | null;
  is_kot_required: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductCustomization = {
  id: number;
  product_id: number;
  group_id: number;
  sort_order: number;
  created_at: string;
};

export type SubmenuItem = {
  id: number;
  submenu_category: string;
  name: string;
  price: number;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PromotionalBanner = {
  id: number;
  outlet_id: number;
  title: string;
  description: string | null;
  image_url: string;
  bg_color: string;
  cta_text: string | null;
  cta_link: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
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

export type Order = {
  id: number;
  outlet_id: number;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: OrderStatus | string;
  razorpay_order_id: string | null;
  order_type: OrderType | string;
  source: OrderSource | string;
  subtotal: number;
  takeaway_charges: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  discount_amount: number;
  rounding_amount: number;
  external_order_id: string | null;
  external_payload: Record<string, unknown> | null;
  external_status: string | null;
  cashier_id: string | null;
  daily_order_number: number | null;
  unique_order_id: string | null;
  token_number: number | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: number;
  order_id: number | null;
  product_config: ProductConfig;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type ProductConfig = {
  product_id: number;
  name: string;
  base_price: number;
  selected_options?: Array<{
    group_id: number;
    group_name: string;
    option_id: number;
    option_name: string;
    price: number;
  }>;
};

export type PaymentSettings = {
  id: number;
  outlet_id: number | null;
  cod_enabled: boolean;
  sms_enabled: boolean;
  shop_open: boolean;
  online_enabled: boolean;
  show_banners: boolean;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
};

export type UserRole = {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
};

export type Printer = {
  id: number;
  outlet_id: number;
  name: string;
  purpose: "kot" | "bill" | "customer_display" | "label";
  interface: "network" | "usb" | "bluetooth" | "cloud";
  address: string | null;
  paper_width: 58 | 80 | 110;
  status: string;
  created_at: string;
  updated_at: string;
};

export type KitchenStation = {
  id: number;
  outlet_id: number;
  name: string;
  printer_id: number | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type KotTicketStatus =
  | "queued"
  | "printing"
  | "printed"
  | "acknowledged"
  | "ready"
  | "served"
  | "void";

export type KotTicket = {
  id: number;
  order_id: number;
  outlet_id: number;
  station_id: number | null;
  ticket_number: number | null;
  status: KotTicketStatus;
  printer_id: number | null;
  printed_at: string | null;
  acknowledged_at: string | null;
  ready_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type KotTicketItem = {
  id: number;
  kot_ticket_id: number;
  order_item_id: number;
  quantity: number;
  notes: string | null;
  created_at: string;
};

export type ChannelItemMapping = {
  id: number;
  outlet_id: number;
  channel: AggregatorChannel;
  external_item_id: string;
  product_id: number;
  price_override: number | null;
  is_available: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalOrderEvent = {
  id: number;
  outlet_id: number | null;
  order_id: number | null;
  channel: string;
  event_type: string;
  external_event_id: string | null;
  payload: Record<string, unknown>;
  signature_ok: boolean | null;
  received_at: string;
};

export type Database = {
  public: {
    Tables: {
      outlets: { Row: Outlet };
      categories: { Row: Category };
      category_submenus: { Row: CategorySubmenu };
      customization_groups: { Row: CustomizationGroup };
      customization_options: { Row: CustomizationOption };
      products: { Row: Product };
      product_customizations: { Row: ProductCustomization };
      submenu_items: { Row: SubmenuItem };
      promotional_banners: { Row: PromotionalBanner };
      orders: { Row: Order };
      order_items: { Row: OrderItem };
      payment_settings: { Row: PaymentSettings };
      profiles: { Row: Profile };
      user_roles: { Row: UserRole };
      printers: { Row: Printer };
      kitchen_stations: { Row: KitchenStation };
      kot_tickets: { Row: KotTicket };
      kot_ticket_items: { Row: KotTicketItem };
      channel_item_mappings: { Row: ChannelItemMapping };
      external_order_events: { Row: ExternalOrderEvent };
    };
  };
};
