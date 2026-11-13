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
  public: {
    Tables: {
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
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
          id: string
          name: string
          outlet_id: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          name: string
          outlet_id: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          id?: string
          name?: string
          outlet_id?: string
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
          id: string
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
          id?: string
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
          id?: string
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
          id: string
          is_available: boolean
          last_synced_at: string | null
          outlet_id: string
          price_override: number | null
          product_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_item_id: string
          id?: string
          is_available?: boolean
          last_synced_at?: string | null
          outlet_id: string
          price_override?: number | null
          product_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_item_id?: string
          id?: string
          is_available?: boolean
          last_synced_at?: string | null
          outlet_id?: string
          price_override?: number | null
          product_id?: string
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
      channel_option_mappings: {
        Row: {
          channel: string
          created_at: string
          external_option_id: string
          id: string
          is_available: boolean
          last_synced_at: string | null
          option_id: string
          outlet_id: string
          price_override: number | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_option_id: string
          id?: string
          is_available?: boolean
          last_synced_at?: string | null
          option_id: string
          outlet_id: string
          price_override?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_option_id?: string
          id?: string
          is_available?: boolean
          last_synced_at?: string | null
          option_id?: string
          outlet_id?: string
          price_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_option_mappings_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "customization_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_option_mappings_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_outlets: {
        Row: {
          channel: string
          created_at: string
          external_store_id: string
          id: string
          is_online: boolean
          last_synced_at: string | null
          offline_reason: string | null
          offline_since: string | null
          outlet_id: string
          prep_time_minutes: number
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          external_store_id: string
          id?: string
          is_online?: boolean
          last_synced_at?: string | null
          offline_reason?: string | null
          offline_since?: string | null
          outlet_id: string
          prep_time_minutes?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_store_id?: string
          id?: string
          is_online?: boolean
          last_synced_at?: string | null
          offline_reason?: string | null
          offline_since?: string | null
          outlet_id?: string
          prep_time_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_outlets_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_groups: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          is_required: boolean | null
          name: string
          outlet_id: string
          selection_type: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          is_required?: boolean | null
          name: string
          outlet_id: string
          selection_type?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          is_required?: boolean | null
          name?: string
          outlet_id?: string
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
          group_id: string
          id: string
          name: string
          price: number
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          name: string
          price?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
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
          id: string
          order_id: string | null
          outlet_id: string | null
          payload: Json
          received_at: string
          signature_ok: boolean | null
        }
        Insert: {
          channel: string
          event_type: string
          external_event_id?: string | null
          id?: string
          order_id?: string | null
          outlet_id?: string | null
          payload: Json
          received_at?: string
          signature_ok?: boolean | null
        }
        Update: {
          channel?: string
          event_type?: string
          external_event_id?: string | null
          id?: string
          order_id?: string | null
          outlet_id?: string | null
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
          id: string
          name: string
          outlet_id: string
          printer_id: string | null
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          outlet_id: string
          printer_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          outlet_id?: string
          printer_id?: string | null
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
          id: string
          kot_ticket_id: string
          notes: string | null
          order_item_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          kot_ticket_id: string
          notes?: string | null
          order_item_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          id?: string
          kot_ticket_id?: string
          notes?: string | null
          order_item_id?: string
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
          id: string
          notes: string | null
          order_id: string
          outlet_id: string
          printed_at: string | null
          printer_id: string | null
          ready_at: string | null
          station_id: string | null
          status: string
          ticket_number: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          outlet_id: string
          printed_at?: string | null
          printer_id?: string | null
          ready_at?: string | null
          station_id?: string | null
          status?: string
          ticket_number?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          outlet_id?: string
          printed_at?: string | null
          printer_id?: string | null
          ready_at?: string | null
          station_id?: string | null
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
          id: string
          instructions: string | null
          order_id: string | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          instructions?: string | null
          order_id?: string | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          id?: string
          instructions?: string | null
          order_id?: string | null
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
          cancel_note: string | null
          cancel_product_ids: string[]
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cashier_id: string | null
          cgst_amount: number
          commission_amount: number
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          daily_order_number: number | null
          delivery_charges: number
          delivery_partner: Json | null
          discount_amount: number
          external_order_id: string | null
          external_payload: Json | null
          external_status: string | null
          gst_paid_by_operator: boolean
          id: string
          igst_amount: number
          instructions: string | null
          net_payout: number | null
          order_type: string | null
          outlet_id: string
          placed_at: string
          platform_discount: number
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
          cancel_note?: string | null
          cancel_product_ids?: string[]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cashier_id?: string | null
          cgst_amount?: number
          commission_amount?: number
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          daily_order_number?: number | null
          delivery_charges?: number
          delivery_partner?: Json | null
          discount_amount?: number
          external_order_id?: string | null
          external_payload?: Json | null
          external_status?: string | null
          gst_paid_by_operator?: boolean
          id?: string
          igst_amount?: number
          instructions?: string | null
          net_payout?: number | null
          order_type?: string | null
          outlet_id: string
          placed_at?: string
          platform_discount?: number
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
          cancel_note?: string | null
          cancel_product_ids?: string[]
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cashier_id?: string | null
          cgst_amount?: number
          commission_amount?: number
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          daily_order_number?: number | null
          delivery_charges?: number
          delivery_partner?: Json | null
          discount_amount?: number
          external_order_id?: string | null
          external_payload?: Json | null
          external_status?: string | null
          gst_paid_by_operator?: boolean
          id?: string
          igst_amount?: number
          instructions?: string | null
          net_payout?: number | null
          order_type?: string | null
          outlet_id?: string
          placed_at?: string
          platform_discount?: number
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
          id: string
          name: string
          opening_hours: Json | null
          phone: string | null
          pincode: string | null
          restaurant_id: string
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
          id?: string
          name: string
          opening_hours?: Json | null
          phone?: string | null
          pincode?: string | null
          restaurant_id: string
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
          id?: string
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          pincode?: string | null
          restaurant_id?: string
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
          id: string
          online_enabled: boolean
          outlet_id: string | null
          shop_open: boolean
          show_banners: boolean
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          cod_enabled?: boolean
          created_at?: string
          id?: string
          online_enabled?: boolean
          outlet_id?: string | null
          shop_open?: boolean
          show_banners?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          cod_enabled?: boolean
          created_at?: string
          id?: string
          online_enabled?: boolean
          outlet_id?: string | null
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
      pos_tabs: {
        Row: {
          created_at: string
          id: string
          lines: Json
          name: string
          outlet_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lines?: Json
          name: string
          outlet_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lines?: Json
          name?: string
          outlet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tabs_outlet_id_fkey"
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
          id: string
          interface: string
          name: string
          outlet_id: string
          paper_width: number
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          interface?: string
          name: string
          outlet_id: string
          paper_width?: number
          purpose?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          interface?: string
          name?: string
          outlet_id?: string
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
          group_id: string
          id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          product_id?: string
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
          id: string
          image_url: string | null
          is_kot_required: boolean
          name: string
          outlet_id: string
          price: number | null
          sku: string | null
          station_id: string | null
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
          id?: string
          image_url?: string | null
          is_kot_required?: boolean
          name: string
          outlet_id: string
          price?: number | null
          sku?: string | null
          station_id?: string | null
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
          id?: string
          image_url?: string | null
          is_kot_required?: boolean
          name?: string
          outlet_id?: string
          price?: number | null
          sku?: string | null
          station_id?: string | null
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
          id: string
          image_url: string
          outlet_id: string
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
          id?: string
          image_url: string
          outlet_id: string
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
          id?: string
          image_url?: string
          outlet_id?: string
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
      restaurant_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          outlet_id: string | null
          restaurant_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          outlet_id?: string | null
          restaurant_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          outlet_id?: string | null
          restaurant_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_api_keys_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_api_keys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          brand_id: string | null
          created_at: string
          custom_domain: string | null
          id: string
          name: string
          owner_user_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          name: string
          owner_user_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
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
          id: string
          name: string
          price: number
          sort_order: number | null
          status: string | null
          submenu_category: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          price?: number
          sort_order?: number | null
          status?: string | null
          submenu_category: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
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
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restaurant_id?: string
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
      get_my_order: {
        Args: { p_order_id: string }
        Returns: {
          cgst_amount: number
          id: string
          items: Json
          order_type: string
          outlet_name: string
          outlet_phone: string
          placed_at: string
          sgst_amount: number
          status: string
          subtotal: number
          takeaway_charges: number
          total_amount: number
          unique_order_id: string
          updated_at: string
        }[]
      }
      get_my_orders: {
        Args: { p_restaurant_id: string }
        Returns: {
          id: string
          items: Json
          order_type: string
          placed_at: string
          status: string
          total_amount: number
          unique_order_id: string
        }[]
      }
      outlet_restaurant_id: { Args: { oid: string }; Returns: string }
      public_bestsellers: {
        Args: { p_limit?: number; p_restaurant_id: string }
        Returns: {
          product_id: string
          quantity: number
        }[]
      }
      public_outlets_for_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: {
          address: string
          city: string
          id: string
          name: string
          phone: string
          pincode: string
          state: string
        }[]
      }
      public_restaurant_by_id: {
        Args: { p_restaurant_id: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      public_restaurant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      purge_channel_data: {
        Args: { p_channel: string; p_older_than?: string }
        Returns: {
          events_deleted: number
          orders_scrubbed: number
        }[]
      }
      restaurant_slug_for_domain: { Args: { host: string }; Returns: string }
      user_has_restaurant_access: { Args: { rid: string }; Returns: boolean }
      user_has_restaurant_role: {
        Args: { allowed: string[]; rid: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "manager"],
    },
  },
} as const
