export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brands: {
        Row: {
          created_at: string
          id: number
          name: string
          owner_user_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          owner_user_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          owner_user_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          emoji: string | null
          id: number
          name: string
          outlet_id: number
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          id?: number
          name: string
          outlet_id: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          id?: number
          name?: string
          outlet_id?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      category_submenus: {
        Row: {
          category: string
          created_at: string | null
          display_name: string
          id: number
          is_required: boolean | null
          selection_type: string
          sort_order: number | null
          submenu_category: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          display_name: string
          id?: number
          is_required?: boolean | null
          selection_type: string
          sort_order?: number | null
          submenu_category: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          display_name?: string
          id?: number
          is_required?: boolean | null
          selection_type?: string
          sort_order?: number | null
          submenu_category?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      channel_item_mappings: {
        Row: {
          channel: string
          created_at: string
          external_item_id: string
          id: number
          is_available: boolean
          last_synced_at: string | null
          outlet_id: number
          price_override: number | null
          product_id: number
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_item_id: string
          id?: number
          is_available?: boolean
          last_synced_at?: string | null
          outlet_id: number
          price_override?: number | null
          product_id: number
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_item_id?: string
          id?: number
          is_available?: boolean
          last_synced_at?: string | null
          outlet_id?: number
          price_override?: number | null
          product_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_item_mappings_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_item_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_groups: {
        Row: {
          created_at: string | null
          display_name: string
          id: number
          is_required: boolean | null
          name: string
          outlet_id: number
          selection_type: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: number
          is_required?: boolean | null
          name: string
          outlet_id: number
          selection_type?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: number
          is_required?: boolean | null
          name?: string
          outlet_id?: number
          selection_type?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customization_groups_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_options: {
        Row: {
          created_at: string | null
          group_id: number
          id: number
          name: string
          price: number
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: number
          id?: number
          name: string
          price?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: number
          id?: number
          name?: string
          price?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customization_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customization_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      external_order_events: {
        Row: {
          channel: string
          event_type: string
          external_event_id: string | null
          id: number
          order_id: number | null
          outlet_id: number | null
          payload: Json
          received_at: string
          signature_ok: boolean | null
        }
        Insert: {
          channel: string
          event_type: string
          external_event_id?: string | null
          id?: number
          order_id?: number | null
          outlet_id?: number | null
          payload: Json
          received_at?: string
          signature_ok?: boolean | null
        }
        Update: {
          channel?: string
          event_type?: string
          external_event_id?: string | null
          id?: number
          order_id?: number | null
          outlet_id?: number | null
          payload?: Json
          received_at?: string
          signature_ok?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "external_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_order_events_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_stations: {
        Row: {
          created_at: string
          id: number
          name: string
          outlet_id: number
          printer_id: number | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          outlet_id: number
          printer_id?: number | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          outlet_id?: number
          printer_id?: number | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stations_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_stations_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_ticket_items: {
        Row: {
          created_at: string
          id: number
          kot_ticket_id: number
          notes: string | null
          order_item_id: number
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: number
          kot_ticket_id: number
          notes?: string | null
          order_item_id: number
          quantity: number
        }
        Update: {
          created_at?: string
          id?: number
          kot_ticket_id?: number
          notes?: string | null
          order_item_id?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "kot_ticket_items_kot_ticket_id_fkey"
            columns: ["kot_ticket_id"]
            isOneToOne: false
            referencedRelation: "kot_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_ticket_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_tickets: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: number
          notes: string | null
          order_id: number
          outlet_id: number
          printed_at: string | null
          printer_id: number | null
          ready_at: string | null
          station_id: number | null
          status: string
          ticket_number: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: number
          notes?: string | null
          order_id: number
          outlet_id: number
          printed_at?: string | null
          printer_id?: number | null
          ready_at?: string | null
          station_id?: number | null
          status?: string
          ticket_number?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: number
          notes?: string | null
          order_id?: number
          outlet_id?: number
          printed_at?: string | null
          printer_id?: number | null
          ready_at?: string | null
          station_id?: number | null
          status?: string
          ticket_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kot_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_tickets_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_tickets_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: number
          order_id: number | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: number
          order_id?: number | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          id?: number
          order_id?: number | null
          product_config?: Json
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cashier_id: string | null
          cgst_amount: number
          created_at: string | null
          customer_email: string
          customer_name: string
          daily_order_number: number | null
          discount_amount: number
          external_order_id: string | null
          external_payload: Json | null
          external_status: string | null
          id: number
          igst_amount: number
          order_type: string | null
          outlet_id: number
          placed_at: string
          razorpay_order_id: string | null
          rounding_amount: number
          sgst_amount: number
          source: string
          status: string | null
          subtotal: number | null
          takeaway_charges: number | null
          token_number: number | null
          total_amount: number
          unique_order_id: string | null
          updated_at: string | null
        }
        Insert: {
          cashier_id?: string | null
          cgst_amount?: number
          created_at?: string | null
          customer_email: string
          customer_name: string
          daily_order_number?: number | null
          discount_amount?: number
          external_order_id?: string | null
          external_payload?: Json | null
          external_status?: string | null
          id?: number
          igst_amount?: number
          order_type?: string | null
          outlet_id: number
          placed_at?: string
          razorpay_order_id?: string | null
          rounding_amount?: number
          sgst_amount?: number
          source?: string
          status?: string | null
          subtotal?: number | null
          takeaway_charges?: number | null
          token_number?: number | null
          total_amount: number
          unique_order_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cashier_id?: string | null
          cgst_amount?: number
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          daily_order_number?: number | null
          discount_amount?: number
          external_order_id?: string | null
          external_payload?: Json | null
          external_status?: string | null
          id?: number
          igst_amount?: number
          order_type?: string | null
          outlet_id?: number
          placed_at?: string
          razorpay_order_id?: string | null
          rounding_amount?: number
          sgst_amount?: number
          source?: string
          status?: string | null
          subtotal?: number | null
          takeaway_charges?: number | null
          token_number?: number | null
          total_amount?: number
          unique_order_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          currency: string
          email: string | null
          fssai_license: string | null
          gstin: string | null
          id: number
          name: string
          phone: string | null
          pincode: string | null
          restaurant_id: number
          slug: string
          state: string | null
          state_code: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          fssai_license?: string | null
          gstin?: string | null
          id?: number
          name: string
          phone?: string | null
          pincode?: string | null
          restaurant_id: number
          slug: string
          state?: string | null
          state_code?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          fssai_license?: string | null
          gstin?: string | null
          id?: number
          name?: string
          phone?: string | null
          pincode?: string | null
          restaurant_id?: number
          slug?: string
          state?: string | null
          state_code?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          order_data: Json
          order_reference: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          order_data: Json
          order_reference: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          order_data?: Json
          order_reference?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          cod_enabled: boolean
          created_at: string
          id: number
          online_enabled: boolean
          outlet_id: number | null
          shop_open: boolean
          show_banners: boolean
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          cod_enabled?: boolean
          created_at?: string
          id?: number
          online_enabled?: boolean
          outlet_id?: number | null
          shop_open?: boolean
          show_banners?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          cod_enabled?: boolean
          created_at?: string
          id?: number
          online_enabled?: boolean
          outlet_id?: number | null
          shop_open?: boolean
          show_banners?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settings_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          address: string | null
          created_at: string
          id: number
          interface: string
          name: string
          outlet_id: number
          paper_width: number
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: number
          interface?: string
          name: string
          outlet_id: number
          paper_width?: number
          purpose?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: number
          interface?: string
          name?: string
          outlet_id?: number
          paper_width?: number
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "printers_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_customizations: {
        Row: {
          created_at: string | null
          group_id: number
          id: number
          product_id: number
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          group_id: number
          id?: number
          product_id: number
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          group_id?: number
          id?: number
          product_id?: number
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customizations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customization_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          code: string | null
          created_at: string | null
          description: string | null
          gst_rate: number
          has_addons: boolean | null
          has_toppings: boolean | null
          hsn_code: string | null
          id: number
          image_url: string | null
          is_kot_required: boolean
          name: string
          outlet_id: number
          price: number | null
          sku: string | null
          station_id: number | null
          status: string | null
          type: string | null
          updated_at: string | null
          veg_status: string | null
        }
        Insert: {
          category: string
          code?: string | null
          created_at?: string | null
          description?: string | null
          gst_rate?: number
          has_addons?: boolean | null
          has_toppings?: boolean | null
          hsn_code?: string | null
          id?: number
          image_url?: string | null
          is_kot_required?: boolean
          name: string
          outlet_id: number
          price?: number | null
          sku?: string | null
          station_id?: number | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          veg_status?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string | null
          description?: string | null
          gst_rate?: number
          has_addons?: boolean | null
          has_toppings?: boolean | null
          hsn_code?: string | null
          id?: number
          image_url?: string | null
          is_kot_required?: boolean
          name?: string
          outlet_id?: number
          price?: number | null
          sku?: string | null
          station_id?: number | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
          veg_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          email: string | null
          id: string
        }
        Insert: {
          email?: string | null
          id: string
        }
        Update: {
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      promotional_banners: {
        Row: {
          bg_color: string | null
          created_at: string | null
          cta_link: string | null
          cta_text: string | null
          description: string | null
          id: number
          image_url: string
          outlet_id: number
          sort_order: number | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          bg_color?: string | null
          created_at?: string | null
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          id?: number
          image_url: string
          outlet_id: number
          sort_order?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          bg_color?: string | null
          created_at?: string | null
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          id?: number
          image_url?: string
          outlet_id?: number
          sort_order?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotional_banners_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_email: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_email: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          brand_id: number | null
          created_at: string
          id: number
          name: string
          owner_user_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_id?: number | null
          created_at?: string
          id?: number
          name: string
          owner_user_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: number | null
          created_at?: string
          id?: number
          name?: string
          owner_user_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      submenu_items: {
        Row: {
          created_at: string | null
          id: number
          name: string
          price: number
          sort_order: number | null
          status: string | null
          submenu_category: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          price?: number
          sort_order?: number | null
          status?: string | null
          submenu_category: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          price?: number
          sort_order?: number | null
          status?: string | null
          submenu_category?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          restaurant_id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restaurant_id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restaurant_id?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      outlet_restaurant_id: { Args: { oid: number }; Returns: number }
      user_has_restaurant_access: { Args: { rid: number }; Returns: boolean }
      user_has_restaurant_role: {
        Args: { allowed: string[]; rid: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user", "manager"],
    },
  },
} as const
