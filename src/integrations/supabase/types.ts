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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          client_class: Database["public"]["Enums"]["client_class"] | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          client_class?: Database["public"]["Enums"]["client_class"] | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          client_class?: Database["public"]["Enums"]["client_class"] | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivered_orders: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          invoice_number: string | null
          observation: string | null
          order_id: string
          sale_price_status: Database["public"]["Enums"]["sale_price_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_number?: string | null
          observation?: string | null
          order_id: string
          sale_price_status?: Database["public"]["Enums"]["sale_price_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_number?: string | null
          observation?: string | null
          order_id?: string
          sale_price_status?: Database["public"]["Enums"]["sale_price_status"]
          updated_at?: string
        }
        Relationships: []
      }
      delivery_entries: {
        Row: {
          control_date: string
          created_at: string
          decision: Database["public"]["Enums"]["delivery_decision"]
          id: string
          moved_at: string
          order_id: string
        }
        Insert: {
          control_date?: string
          created_at?: string
          decision: Database["public"]["Enums"]["delivery_decision"]
          id?: string
          moved_at?: string
          order_id: string
        }
        Update: {
          control_date?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["delivery_decision"]
          id?: string
          moved_at?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      equipments: {
        Row: {
          capacity: string
          created_at: string
          designation: string
          id: string
          state: Database["public"]["Enums"]["equipment_state"]
          type: Database["public"]["Enums"]["equipment_type"]
          updated_at: string
        }
        Insert: {
          capacity?: string
          created_at?: string
          designation: string
          id?: string
          state?: Database["public"]["Enums"]["equipment_state"]
          type: Database["public"]["Enums"]["equipment_type"]
          updated_at?: string
        }
        Update: {
          capacity?: string
          created_at?: string
          designation?: string
          id?: string
          state?: Database["public"]["Enums"]["equipment_state"]
          type?: Database["public"]["Enums"]["equipment_type"]
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      operations: {
        Row: {
          category: Database["public"]["Enums"]["operation_category"]
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["operation_category"]
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["operation_category"]
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      operators: {
        Row: {
          created_at: string
          id: string
          main_equipment: string | null
          main_function: string
          name: string
          secondary_equipments: string[]
          secondary_functions: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          main_equipment?: string | null
          main_function: string
          name: string
          secondary_equipments?: string[]
          secondary_functions?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          main_equipment?: string | null
          main_function?: string
          name?: string
          secondary_equipments?: string[]
          secondary_functions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operators_main_equipment_fkey"
            columns: ["main_equipment"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          client_representative: string | null
          complementary_quantity: number | null
          created_at: string
          delivery_deadline: string | null
          designation: string
          display_order: number | null
          drawing_model: string | null
          frozen_order: boolean
          id: string
          instructions: string | null
          manual_sort_order: number | null
          material_received_date: string | null
          material_status: Database["public"]["Enums"]["resource_status"]
          notes_updated_at: string | null
          observation: string | null
          order_date: string
          order_number: string
          planned_deadline: string
          priority: Database["public"]["Enums"]["order_priority"] | null
          prototype_deadline: string | null
          prototype_quantity: number | null
          quantity: number
          study_status: Database["public"]["Enums"]["resource_status"]
          tooling_status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_representative?: string | null
          complementary_quantity?: number | null
          created_at?: string
          delivery_deadline?: string | null
          designation: string
          display_order?: number | null
          drawing_model?: string | null
          frozen_order?: boolean
          id?: string
          instructions?: string | null
          manual_sort_order?: number | null
          material_received_date?: string | null
          material_status?: Database["public"]["Enums"]["resource_status"]
          notes_updated_at?: string | null
          observation?: string | null
          order_date?: string
          order_number: string
          planned_deadline?: string
          priority?: Database["public"]["Enums"]["order_priority"] | null
          prototype_deadline?: string | null
          prototype_quantity?: number | null
          quantity?: number
          study_status?: Database["public"]["Enums"]["resource_status"]
          tooling_status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_representative?: string | null
          complementary_quantity?: number | null
          created_at?: string
          delivery_deadline?: string | null
          designation?: string
          display_order?: number | null
          drawing_model?: string | null
          frozen_order?: boolean
          id?: string
          instructions?: string | null
          manual_sort_order?: number | null
          material_received_date?: string | null
          material_status?: Database["public"]["Enums"]["resource_status"]
          notes_updated_at?: string | null
          observation?: string | null
          order_date?: string
          order_number?: string
          planned_deadline?: string
          priority?: Database["public"]["Enums"]["order_priority"] | null
          prototype_deadline?: string | null
          prototype_quantity?: number | null
          quantity?: number
          study_status?: Database["public"]["Enums"]["resource_status"]
          tooling_status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      production_records: {
        Row: {
          actual_duration: number
          client_name_snapshot: string | null
          created_at: string
          designation_snapshot: string | null
          id: string
          operation_id: string
          operation_name_snapshot: string | null
          operator_id: string
          order_id: string
          order_number_snapshot: string | null
          quantity_snapshot: number | null
          step_id: string
          validated_at: string
          work_status: string
        }
        Insert: {
          actual_duration?: number
          client_name_snapshot?: string | null
          created_at?: string
          designation_snapshot?: string | null
          id?: string
          operation_id: string
          operation_name_snapshot?: string | null
          operator_id: string
          order_id: string
          order_number_snapshot?: string | null
          quantity_snapshot?: number | null
          step_id: string
          validated_at?: string
          work_status?: string
        }
        Update: {
          actual_duration?: number
          client_name_snapshot?: string | null
          created_at?: string
          designation_snapshot?: string | null
          id?: string
          operation_id?: string
          operation_name_snapshot?: string | null
          operator_id?: string
          order_id?: string
          order_number_snapshot?: string | null
          quantity_snapshot?: number | null
          step_id?: string
          validated_at?: string
          work_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_records_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_steps: {
        Row: {
          created_at: string
          depends_on: string | null
          depends_on_percentage: number | null
          end_date: string | null
          end_time: string | null
          equipment_ids: string[]
          estimated_duration: number
          frozen: boolean
          id: string
          material_deadline: string | null
          material_status: Database["public"]["Enums"]["resource_status"]
          operation_id: string
          operator_id: string | null
          order_id: string
          raw_material_needs: string[]
          special_tooling_needs: string[]
          start_date: string | null
          start_time: string | null
          step_order: number
          study_completed_date: string | null
          study_deadline: string | null
          study_status: Database["public"]["Enums"]["resource_status"]
          subcontracting_deadline: string | null
          subcontracting_done: boolean
          subcontracting_received_date: string | null
          subcontractor_id: string | null
          tooling_deadline: string | null
          tooling_received_date: string | null
          tooling_status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          depends_on?: string | null
          depends_on_percentage?: number | null
          end_date?: string | null
          end_time?: string | null
          equipment_ids?: string[]
          estimated_duration?: number
          frozen?: boolean
          id?: string
          material_deadline?: string | null
          material_status?: Database["public"]["Enums"]["resource_status"]
          operation_id: string
          operator_id?: string | null
          order_id: string
          raw_material_needs?: string[]
          special_tooling_needs?: string[]
          start_date?: string | null
          start_time?: string | null
          step_order?: number
          study_completed_date?: string | null
          study_deadline?: string | null
          study_status?: Database["public"]["Enums"]["resource_status"]
          subcontracting_deadline?: string | null
          subcontracting_done?: boolean
          subcontracting_received_date?: string | null
          subcontractor_id?: string | null
          tooling_deadline?: string | null
          tooling_received_date?: string | null
          tooling_status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          depends_on?: string | null
          depends_on_percentage?: number | null
          end_date?: string | null
          end_time?: string | null
          equipment_ids?: string[]
          estimated_duration?: number
          frozen?: boolean
          id?: string
          material_deadline?: string | null
          material_status?: Database["public"]["Enums"]["resource_status"]
          operation_id?: string
          operator_id?: string | null
          order_id?: string
          raw_material_needs?: string[]
          special_tooling_needs?: string[]
          start_date?: string | null
          start_time?: string | null
          step_order?: number
          study_completed_date?: string | null
          study_deadline?: string | null
          study_status?: Database["public"]["Enums"]["resource_status"]
          subcontracting_deadline?: string | null
          subcontracting_done?: boolean
          subcontracting_received_date?: string | null
          subcontractor_id?: string | null
          tooling_deadline?: string | null
          tooling_received_date?: string | null
          tooling_status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_steps_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "production_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_steps_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_steps_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_steps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_steps_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_control_entries: {
        Row: {
          control_date: string
          created_at: string
          decision: Database["public"]["Enums"]["qc_decision"] | null
          id: string
          order_id: string
          rework_notes: string | null
        }
        Insert: {
          control_date?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["qc_decision"] | null
          id?: string
          order_id: string
          rework_notes?: string | null
        }
        Update: {
          control_date?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["qc_decision"] | null
          id?: string
          order_id?: string
          rework_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_control_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          company_name: string
          created_at: string
          id: string
          main_activity: string
          secondary_activities: string[]
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          main_activity: string
          secondary_activities?: string[]
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          main_activity?: string
          secondary_activities?: string[]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      client_class: "A" | "B" | "C" | "D" | "E"
      delivery_decision: "conforme" | "conforme-derogation"
      equipment_state:
        | "En marche"
        | "Mode dégradé"
        | "Maintenance/réparation"
        | "En panne"
      equipment_type:
        | "Fraiseuse conventionnelle"
        | "Tour conventionnel"
        | "Tour CNC"
        | "Rectifieuse plane"
        | "Rectifieuse cylindrique"
        | "Étau limeur"
        | "Perceuse à colonne"
        | "Four"
        | "Touret"
        | "Scie mécanique"
        | "Scie circulaire"
        | "Autres (Visseuse, meuleuse, perceuse, ...)"
        | "Plateau diviseur"
        | "Plateau circulaire"
        | "Tête taraudeuse"
      operation_category: "operator" | "subcontractor"
      order_priority: "P1" | "P2" | "P3" | "P4" | "undetermined"
      qc_decision:
        | "conforme"
        | "reprise-retouche"
        | "conforme-derogation"
        | "non-conforme"
      resource_status:
        | "disponible"
        | "non-disponible"
        | "partiel"
        | "non-applicable"
      sale_price_status: "gratuit" | "non-calcule" | "non-valide" | "valide"
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
  public: {
    Enums: {
      client_class: ["A", "B", "C", "D", "E"],
      delivery_decision: ["conforme", "conforme-derogation"],
      equipment_state: [
        "En marche",
        "Mode dégradé",
        "Maintenance/réparation",
        "En panne",
      ],
      equipment_type: [
        "Fraiseuse conventionnelle",
        "Tour conventionnel",
        "Tour CNC",
        "Rectifieuse plane",
        "Rectifieuse cylindrique",
        "Étau limeur",
        "Perceuse à colonne",
        "Four",
        "Touret",
        "Scie mécanique",
        "Scie circulaire",
        "Autres (Visseuse, meuleuse, perceuse, ...)",
        "Plateau diviseur",
        "Plateau circulaire",
        "Tête taraudeuse",
      ],
      operation_category: ["operator", "subcontractor"],
      order_priority: ["P1", "P2", "P3", "P4", "undetermined"],
      qc_decision: [
        "conforme",
        "reprise-retouche",
        "conforme-derogation",
        "non-conforme",
      ],
      resource_status: [
        "disponible",
        "non-disponible",
        "partiel",
        "non-applicable",
      ],
      sale_price_status: ["gratuit", "non-calcule", "non-valide", "valide"],
    },
  },
} as const
