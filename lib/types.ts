export type AppRole = "admin" | "user" | "manager";

export type Category = {
  id: number;
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

export type Order = {
  id: number;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: OrderStatus | string;
  razorpay_order_id: string | null;
  order_type: OrderType | string;
  subtotal: number;
  takeaway_charges: number;
  daily_order_number: number | null;
  unique_order_id: string | null;
  token_number: number | null;
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

export type Database = {
  public: {
    Tables: {
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
    };
  };
};
