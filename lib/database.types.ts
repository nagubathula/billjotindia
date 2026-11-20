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
      api_rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
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
          station_id: string | null
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
          station_id?: string | null
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
          station_id?: string | null
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
          {
            foreignKeyName: "categories_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
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
      corporate_clients: {
        Row: {
          billing_address: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          credit_limit: number
          email: string | null
          gstin: string | null
          id: string
          notes: string | null
          payment_terms: string
          phone: string | null
          restaurant_id: string
          state_code: string | null
          state_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          restaurant_id: string
          state_code?: string | null
          state_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          restaurant_id?: string
          state_code?: string | null
          state_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_clients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_invoices: {
        Row: {
          amount_paid: number
          cgst_amount: number
          corporate_client_id: string
          created_at: string
          due_date: string | null
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          line_items: Json
          linked_order_ids: string[]
          notes: string | null
          outlet_id: string | null
          payment_status: string
          place_of_supply: string | null
          po_reference: string | null
          restaurant_id: string
          sgst_amount: number
          status: string
          supply_type: string
          taxable_subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cgst_amount?: number
          corporate_client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          line_items?: Json
          linked_order_ids?: string[]
          notes?: string | null
          outlet_id?: string | null
          payment_status?: string
          place_of_supply?: string | null
          po_reference?: string | null
          restaurant_id: string
          sgst_amount?: number
          status?: string
          supply_type?: string
          taxable_subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cgst_amount?: number
          corporate_client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          line_items?: Json
          linked_order_ids?: string[]
          notes?: string | null
          outlet_id?: string | null
          payment_status?: string
          place_of_supply?: string | null
          po_reference?: string | null
          restaurant_id?: string
          sgst_amount?: number
          status?: string
          supply_type?: string
          taxable_subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_invoices_corporate_client_id_fkey"
            columns: ["corporate_client_id"]
            isOneToOne: false
            referencedRelation: "corporate_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_invoices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          channel: string
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_amount: number
          restaurant_id: string
          title: string
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          channel?: string
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          restaurant_id: string
          title: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          channel?: string
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          restaurant_id?: string
          title?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tab_transactions: {
        Row: {
          amount: number
          balance_after: number
          entry_type: string
          id: string
          note: string | null
          order_id: string | null
          payment_mode: string | null
          recorded_at: string
          reference_no: string | null
          restaurant_id: string
          tab_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          entry_type: string
          id?: string
          note?: string | null
          order_id?: string | null
          payment_mode?: string | null
          recorded_at?: string
          reference_no?: string | null
          restaurant_id: string
          tab_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          entry_type?: string
          id?: string
          note?: string | null
          order_id?: string | null
          payment_mode?: string | null
          recorded_at?: string
          reference_no?: string | null
          restaurant_id?: string
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tab_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tab_transactions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tab_transactions_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "customer_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tabs: {
        Row: {
          company_or_notes: string | null
          created_at: string
          credit_limit: number
          current_balance: number
          customer_name: string
          email: string | null
          id: string
          outlet_id: string | null
          phone: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_or_notes?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          customer_name: string
          email?: string | null
          id?: string
          outlet_id?: string | null
          phone?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_or_notes?: string | null
          created_at?: string
          credit_limit?: number
          current_balance?: number
          customer_name?: string
          email?: string | null
          id?: string
          outlet_id?: string | null
          phone?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tabs_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tabs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_groups: {
        Row: {
          created_at: string | null
          display_name: string
          free_selections: number
          id: string
          is_required: boolean | null
          max_selections: number | null
          min_selections: number
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
          free_selections?: number
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number
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
          free_selections?: number
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number
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
          is_default: boolean
          max_qty: number
          name: string
          price: number
          sort_order: number | null
          status: string | null
          updated_at: string | null
          variant_prices: Json
          veg_status: string
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          is_default?: boolean
          max_qty?: number
          name: string
          price?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
          variant_prices?: Json
          veg_status?: string
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          is_default?: boolean
          max_qty?: number
          name?: string
          price?: number
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
          variant_prices?: Json
          veg_status?: string
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
      hr_advances: {
        Row: {
          advance_date: string
          amount: number
          created_at: string
          deducted_payroll_month: string | null
          employee_id: string
          id: string
          note: string | null
          payment_mode: string
          restaurant_id: string
        }
        Insert: {
          advance_date?: string
          amount: number
          created_at?: string
          deducted_payroll_month?: string | null
          employee_id: string
          id?: string
          note?: string | null
          payment_mode?: string
          restaurant_id: string
        }
        Update: {
          advance_date?: string
          amount?: number
          created_at?: string
          deducted_payroll_month?: string | null
          employee_id?: string
          id?: string
          note?: string | null
          payment_mode?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_advances_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          id: string
          note: string | null
          overtime_hours: number
          restaurant_id: string
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          note?: string | null
          overtime_hours?: number
          restaurant_id: string
          status: string
          updated_at?: string
          work_date: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          note?: string | null
          overtime_hours?: number
          restaurant_id?: string
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          auth_user_id: string | null
          base_pay: number
          created_at: string
          department: string
          designation: string
          email: string | null
          employee_code: string
          employment_type: string
          full_name: string
          govt_id_note: string | null
          id: string
          joined_on: string
          outlet_id: string | null
          pay_type: string
          phone: string | null
          restaurant_id: string
          shift_name: string
          status: string
          updated_at: string
          upi_or_bank: string | null
        }
        Insert: {
          auth_user_id?: string | null
          base_pay?: number
          created_at?: string
          department?: string
          designation: string
          email?: string | null
          employee_code: string
          employment_type?: string
          full_name: string
          govt_id_note?: string | null
          id?: string
          joined_on?: string
          outlet_id?: string | null
          pay_type?: string
          phone?: string | null
          restaurant_id: string
          shift_name?: string
          status?: string
          updated_at?: string
          upi_or_bank?: string | null
        }
        Update: {
          auth_user_id?: string | null
          base_pay?: number
          created_at?: string
          department?: string
          designation?: string
          email?: string | null
          employee_code?: string
          employment_type?: string
          full_name?: string
          govt_id_note?: string | null
          id?: string
          joined_on?: string
          outlet_id?: string | null
          pay_type?: string
          phone?: string | null
          restaurant_id?: string
          shift_name?: string
          status?: string
          updated_at?: string
          upi_or_bank?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_entries: {
        Row: {
          advance_deduction: number
          bonus_amount: number
          created_at: string
          days_in_month: number
          employee_id: string
          gross_earned: number
          id: string
          net_payable: number
          note: string | null
          other_deduction: number
          overtime_hours: number
          overtime_pay: number
          paid_at: string | null
          payable_days: number
          payment_mode: string | null
          payment_status: string
          payroll_month: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          advance_deduction?: number
          bonus_amount?: number
          created_at?: string
          days_in_month: number
          employee_id: string
          gross_earned?: number
          id?: string
          net_payable?: number
          note?: string | null
          other_deduction?: number
          overtime_hours?: number
          overtime_pay?: number
          paid_at?: string | null
          payable_days?: number
          payment_mode?: string | null
          payment_status?: string
          payroll_month: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          advance_deduction?: number
          bonus_amount?: number
          created_at?: string
          days_in_month?: number
          employee_id?: string
          gross_earned?: number
          id?: string
          net_payable?: number
          note?: string | null
          other_deduction?: number
          overtime_hours?: number
          overtime_pay?: number
          paid_at?: string | null
          payable_days?: number
          payment_mode?: string | null
          payment_status?: string
          payroll_month?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_materials: {
        Row: {
          category: string
          cost_per_unit: number
          created_at: string
          current_stock: number
          id: string
          name: string
          outlet_id: string | null
          reorder_level: number
          restaurant_id: string
          sku: string
          status: string
          unit: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          category?: string
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          outlet_id?: string | null
          reorder_level?: number
          restaurant_id: string
          sku: string
          status?: string
          unit?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          category?: string
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          outlet_id?: string | null
          reorder_level?: number
          restaurant_id?: string
          sku?: string
          status?: string
          unit?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_materials_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_materials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          movement_type: string
          note: string | null
          outlet_id: string | null
          quantity_delta: number
          reference_order_id: string | null
          reference_po_id: string | null
          restaurant_id: string
          stock_after: number
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          movement_type: string
          note?: string | null
          outlet_id?: string | null
          quantity_delta: number
          reference_order_id?: string | null
          reference_po_id?: string | null
          restaurant_id: string
          stock_after: number
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          movement_type?: string
          note?: string | null
          outlet_id?: string | null
          quantity_delta?: number
          reference_order_id?: string | null
          reference_po_id?: string | null
          restaurant_id?: string
          stock_after?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventory_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_reference_order_id_fkey"
            columns: ["reference_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_reference_po_id_fkey"
            columns: ["reference_po_id"]
            isOneToOne: false
            referencedRelation: "vendor_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
      loyalty_settings: {
        Row: {
          created_at: string
          is_enabled: boolean
          max_redeem_pct: number
          min_order_for_earn: number
          min_points_to_redeem: number
          point_value: number
          points_per_100: number
          restaurant_id: string
          updated_at: string
          welcome_bonus_points: number
        }
        Insert: {
          created_at?: string
          is_enabled?: boolean
          max_redeem_pct?: number
          min_order_for_earn?: number
          min_points_to_redeem?: number
          point_value?: number
          points_per_100?: number
          restaurant_id: string
          updated_at?: string
          welcome_bonus_points?: number
        }
        Update: {
          created_at?: string
          is_enabled?: boolean
          max_redeem_pct?: number
          min_order_for_earn?: number
          min_points_to_redeem?: number
          point_value?: number
          points_per_100?: number
          restaurant_id?: string
          updated_at?: string
          welcome_bonus_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string | null
          outlet_id: string | null
          points_delta: number
          restaurant_id: string
          rupee_value: number
          txn_type: string
          wallet_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          outlet_id?: string | null
          points_delta: number
          restaurant_id: string
          rupee_value?: number
          txn_type: string
          wallet_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          outlet_id?: string | null
          points_delta?: number
          restaurant_id?: string
          rupee_value?: number
          txn_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "loyalty_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_wallets: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          last_visit_at: string | null
          lifetime_earned: number
          lifetime_redeemed: number
          phone_normalized: string
          points_balance: number
          restaurant_id: string
          total_spent: number
          updated_at: string
          visits_count: number
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_earned?: number
          lifetime_redeemed?: number
          phone_normalized: string
          points_balance?: number
          restaurant_id: string
          total_spent?: number
          updated_at?: string
          visits_count?: number
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_earned?: number
          lifetime_redeemed?: number
          phone_normalized?: string
          points_balance?: number
          restaurant_id?: string
          total_spent?: number
          updated_at?: string
          visits_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_wallets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          instructions: string | null
          order_id: string | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          instructions?: string | null
          order_id?: string | null
          product_config: Json
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
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
      order_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          outlet_id: string
          payment_mode: string
          reference_no: string | null
          restaurant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          outlet_id: string
          payment_mode: string
          reference_no?: string | null
          restaurant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          outlet_id?: string
          payment_mode?: string
          reference_no?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          customer_account_id: string | null
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
          loyalty_discount_amount: number
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          net_payout: number | null
          offline_id: string | null
          offline_synced_at: string | null
          order_type: string | null
          outlet_id: string
          payment_mode: string | null
          payment_provider: string | null
          payment_status: string | null
          placed_at: string
          platform_discount: number
          razorpay_order_id: string | null
          rounding_amount: number
          sgst_amount: number
          source: string
          status: string | null
          stripe_session_id: string | null
          subtotal: number | null
          table_id: string | null
          takeaway_charges: number | null
          token_number: number | null
          total_amount: number
          unique_order_id: string | null
          updated_at: string | null
          voided_items: Json
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
          customer_account_id?: string | null
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
          loyalty_discount_amount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          net_payout?: number | null
          offline_id?: string | null
          offline_synced_at?: string | null
          order_type?: string | null
          outlet_id: string
          payment_mode?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          placed_at?: string
          platform_discount?: number
          razorpay_order_id?: string | null
          rounding_amount?: number
          sgst_amount?: number
          source?: string
          status?: string | null
          stripe_session_id?: string | null
          subtotal?: number | null
          table_id?: string | null
          takeaway_charges?: number | null
          token_number?: number | null
          total_amount: number
          unique_order_id?: string | null
          updated_at?: string | null
          voided_items?: Json
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
          customer_account_id?: string | null
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
          loyalty_discount_amount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          net_payout?: number | null
          offline_id?: string | null
          offline_synced_at?: string | null
          order_type?: string | null
          outlet_id?: string
          payment_mode?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          placed_at?: string
          platform_discount?: number
          razorpay_order_id?: string | null
          rounding_amount?: number
          sgst_amount?: number
          source?: string
          status?: string | null
          stripe_session_id?: string | null
          subtotal?: number | null
          table_id?: string | null
          takeaway_charges?: number | null
          token_number?: number | null
          total_amount?: number
          unique_order_id?: string | null
          updated_at?: string | null
          voided_items?: Json
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
            foreignKeyName: "orders_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "storefront_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pos_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          expense_date: string
          id: string
          note: string | null
          outlet_id: string | null
          paid_to: string | null
          payment_mode: string
          restaurant_id: string
          title: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          note?: string | null
          outlet_id?: string | null
          paid_to?: string | null
          payment_mode?: string
          restaurant_id: string
          title: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          note?: string | null
          outlet_id?: string | null
          paid_to?: string | null
          payment_mode?: string
          restaurant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_expenses_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          booking_advance_days: number
          booking_deposit_min_party: number
          booking_deposit_per_guest: number
          booking_max_party_size: number
          booking_slot_minutes: number
          booking_turn_minutes: number
          bookings_enabled: boolean
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
          booking_advance_days?: number
          booking_deposit_min_party?: number
          booking_deposit_per_guest?: number
          booking_max_party_size?: number
          booking_slot_minutes?: number
          booking_turn_minutes?: number
          bookings_enabled?: boolean
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
          booking_advance_days?: number
          booking_deposit_min_party?: number
          booking_deposit_per_guest?: number
          booking_max_party_size?: number
          booking_slot_minutes?: number
          booking_turn_minutes?: number
          bookings_enabled?: boolean
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
          order_id: string | null
          outlet_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lines?: Json
          name: string
          order_id?: string | null
          outlet_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lines?: Json
          name?: string
          order_id?: string | null
          outlet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tabs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
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
          kick_cash_drawer: boolean
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
          kick_cash_drawer?: boolean
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
          kick_cash_drawer?: boolean
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
          is_required_override: boolean | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          is_required_override?: boolean | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          is_required_override?: boolean | null
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
      product_recipes: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_id: string
          quantity_per_unit: number
          restaurant_id: string
          updated_at: string
          wastage_pct: number
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          quantity_per_unit: number
          restaurant_id: string
          updated_at?: string
          wastage_pct?: number
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          quantity_per_unit?: number
          restaurant_id?: string
          updated_at?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_recipes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventory_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recipes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
      register_shifts: {
        Row: {
          card_sales: number
          cash_sales: number
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          denominations: Json
          expected_cash: number
          id: string
          online_sales: number
          opened_at: string
          opened_by: string | null
          opening_float: number
          outlet_id: string
          petty_cash_expenses: number
          restaurant_id: string
          shift_date: string
          status: string
          tab_sales: number
          updated_at: string
          upi_sales: number
          variance: number | null
          variance_note: string | null
        }
        Insert: {
          card_sales?: number
          cash_sales?: number
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          denominations?: Json
          expected_cash?: number
          id?: string
          online_sales?: number
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          outlet_id: string
          petty_cash_expenses?: number
          restaurant_id: string
          shift_date: string
          status?: string
          tab_sales?: number
          updated_at?: string
          upi_sales?: number
          variance?: number | null
          variance_note?: string | null
        }
        Update: {
          card_sales?: number
          cash_sales?: number
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          denominations?: Json
          expected_cash?: number
          id?: string
          online_sales?: number
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          outlet_id?: string
          petty_cash_expenses?: number
          restaurant_id?: string
          shift_date?: string
          status?: string
          tab_sales?: number
          updated_at?: string
          upi_sales?: number
          variance?: number | null
          variance_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "register_shifts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_api_keys: {
        Row: {
          allowed_origins: string[]
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
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          allowed_origins?: string[]
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
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          allowed_origins?: string[]
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
          webhook_secret?: string | null
          webhook_url?: string | null
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
      server_error_logs: {
        Row: {
          context: Json
          created_at: string
          digest: string | null
          error_name: string | null
          id: string
          message: string
          method: string | null
          route: string
          stack: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          digest?: string | null
          error_name?: string | null
          id?: string
          message: string
          method?: string | null
          route: string
          stack?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          digest?: string | null
          error_name?: string | null
          id?: string
          message?: string
          method?: string | null
          route?: string
          stack?: string | null
        }
        Relationships: []
      }
      storefront_customers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          password_hash: string
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          password_hash: string
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          password_hash?: string
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
      table_bookings: {
        Row: {
          booking_code: string
          booking_type: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          deposit_amount: number
          deposit_status: string
          duration_minutes: number
          id: string
          occasion: string | null
          outlet_id: string
          party_size: number
          payment_provider: string | null
          payment_reference: string | null
          preferred_zone: string | null
          queue_number: number | null
          quoted_wait_minutes: number | null
          reserved_for: string
          restaurant_id: string
          seated_at: string | null
          source: string
          special_requests: string | null
          status: string
          table_id: string | null
          updated_at: string
        }
        Insert: {
          booking_code: string
          booking_type?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          deposit_amount?: number
          deposit_status?: string
          duration_minutes?: number
          id?: string
          occasion?: string | null
          outlet_id: string
          party_size: number
          payment_provider?: string | null
          payment_reference?: string | null
          preferred_zone?: string | null
          queue_number?: number | null
          quoted_wait_minutes?: number | null
          reserved_for: string
          restaurant_id: string
          seated_at?: string | null
          source?: string
          special_requests?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_code?: string
          booking_type?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          deposit_amount?: number
          deposit_status?: string
          duration_minutes?: number
          id?: string
          occasion?: string | null
          outlet_id?: string
          party_size?: number
          payment_provider?: string | null
          payment_reference?: string | null
          preferred_zone?: string | null
          queue_number?: number | null
          quoted_wait_minutes?: number | null
          reserved_for?: string
          restaurant_id?: string
          seated_at?: string | null
          source?: string
          special_requests?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_bookings_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_bookings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "pos_tabs"
            referencedColumns: ["id"]
          },
        ]
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
      vendor_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          payment_date: string
          payment_mode: string
          purchase_order_id: string | null
          reference_no: string | null
          restaurant_id: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_mode?: string
          purchase_order_id?: string | null
          reference_no?: string | null
          restaurant_id: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          payment_date?: string
          payment_mode?: string
          purchase_order_id?: string | null
          reference_no?: string | null
          restaurant_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_purchase_orders: {
        Row: {
          amount_paid: number
          created_at: string
          expected_date: string | null
          gst_amount: number
          id: string
          invoice_number: string | null
          items: Json
          notes: string | null
          order_date: string
          outlet_id: string | null
          payment_status: string
          po_number: string
          received_at: string | null
          restaurant_id: string
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          expected_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number?: string | null
          items?: Json
          notes?: string | null
          order_date?: string
          outlet_id?: string | null
          payment_status?: string
          po_number: string
          received_at?: string | null
          restaurant_id: string
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          expected_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number?: string | null
          items?: Json
          notes?: string | null
          order_date?: string
          outlet_id?: string | null
          payment_status?: string
          po_number?: string
          received_at?: string | null
          restaurant_id?: string
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_purchase_orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          category: string
          contact_person: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string
          phone: string | null
          restaurant_id: string
          status: string
          updated_at: string
          upi_or_bank: string | null
          vendor_code: string
        }
        Insert: {
          address?: string | null
          category?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
          upi_or_bank?: string | null
          vendor_code: string
        }
        Update: {
          address?: string | null
          category?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string
          phone?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          upi_or_bank?: string | null
          vendor_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_restaurant_id_fkey"
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
      consume_rate_limit: {
        Args: { p_bucket: string; p_window_seconds?: number }
        Returns: Json
      }
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
      user_is_brand_restaurant_admin: {
        Args: { bid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "manager" | "captain"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user", "manager", "captain"],
    },
  },
} as const
