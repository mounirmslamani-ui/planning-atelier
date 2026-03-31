
-- Enums
CREATE TYPE public.equipment_state AS ENUM ('En marche', 'Mode dégradé', 'Maintenance/réparation', 'En panne');
CREATE TYPE public.equipment_type AS ENUM (
  'Fraiseuse conventionnelle', 'Tour conventionnel', 'Tour CNC',
  'Rectifieuse plane', 'Rectifieuse cylindrique', 'Étau limeur',
  'Perceuse à colonne', 'Four', 'Touret', 'Scie mécanique',
  'Scie circulaire', 'Autres (Visseuse, meuleuse, perceuse, ...)',
  'Plateau diviseur', 'Plateau circulaire', 'Tête taraudeuse'
);
CREATE TYPE public.operation_category AS ENUM ('operator', 'subcontractor');
CREATE TYPE public.client_class AS ENUM ('A', 'B', 'C', 'D', 'E');
CREATE TYPE public.order_priority AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');
CREATE TYPE public.qc_decision AS ENUM ('conforme', 'reprise-retouche', 'conforme-derogation', 'non-conforme');
CREATE TYPE public.delivery_decision AS ENUM ('conforme', 'conforme-derogation');

-- Equipments
CREATE TABLE public.equipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  designation TEXT NOT NULL,
  type public.equipment_type NOT NULL,
  capacity TEXT NOT NULL DEFAULT '',
  state public.equipment_state NOT NULL DEFAULT 'En marche',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operators
CREATE TABLE public.operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  main_function TEXT NOT NULL,
  secondary_functions TEXT[] NOT NULL DEFAULT '{}',
  main_equipment UUID REFERENCES public.equipments(id) ON DELETE SET NULL,
  secondary_equipments UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subcontractors
CREATE TABLE public.subcontractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  main_activity TEXT NOT NULL,
  secondary_activities TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operations
CREATE TABLE public.operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category public.operation_category NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  client_class public.client_class,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  designation TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  priority public.order_priority NOT NULL DEFAULT 'P3',
  display_order INTEGER,
  frozen_order BOOLEAN NOT NULL DEFAULT false,
  planned_deadline DATE NOT NULL DEFAULT CURRENT_DATE,
  prototype_quantity INTEGER,
  prototype_deadline DATE,
  delivery_deadline DATE,
  complementary_quantity INTEGER,
  material_available BOOLEAN NOT NULL DEFAULT false,
  tooling_available BOOLEAN NOT NULL DEFAULT false,
  study_ready BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Production Steps
CREATE TABLE public.production_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
  subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE RESTRICT,
  estimated_duration INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  start_time TIME,
  end_date DATE,
  end_time TIME,
  depends_on UUID REFERENCES public.production_steps(id) ON DELETE SET NULL,
  depends_on_percentage INTEGER DEFAULT 100 CHECK (depends_on_percentage >= 0 AND depends_on_percentage <= 100),
  step_order INTEGER NOT NULL DEFAULT 0,
  frozen BOOLEAN NOT NULL DEFAULT false,
  equipment_ids UUID[] NOT NULL DEFAULT '{}',
  subcontracting_done BOOLEAN NOT NULL DEFAULT false,
  subcontracting_deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Holidays
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Production Records
CREATE TABLE public.production_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.production_steps(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE RESTRICT,
  actual_duration INTEGER NOT NULL DEFAULT 0,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quality Control Entries
CREATE TABLE public.quality_control_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  control_date DATE NOT NULL DEFAULT CURRENT_DATE,
  decision public.qc_decision,
  rework_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delivery Entries
CREATE TABLE public.delivery_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  control_date DATE NOT NULL DEFAULT CURRENT_DATE,
  decision public.delivery_decision NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (no policies yet - will be added when auth is implemented)
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_control_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_entries ENABLE ROW LEVEL SECURITY;

-- Temporary public access policies (to be replaced with auth-based policies later)
CREATE POLICY "Allow all access to equipments" ON public.equipments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to operators" ON public.operators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to subcontractors" ON public.subcontractors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to operations" ON public.operations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to production_steps" ON public.production_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to holidays" ON public.holidays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to production_records" ON public.production_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to quality_control_entries" ON public.quality_control_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to delivery_entries" ON public.delivery_entries FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_records;
