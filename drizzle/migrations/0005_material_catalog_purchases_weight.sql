-- PARTIE 1 : materials
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.material_grades(id) ON DELETE RESTRICT,
  format_id uuid NOT NULL REFERENCES public.material_formats(id) ON DELETE RESTRICT,
  dimension_id uuid NOT NULL REFERENCES public.material_dimensions(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materials_unique_combination UNIQUE (grade_id, format_id, dimension_id)
);
CREATE INDEX IF NOT EXISTS idx_materials_grade_format ON public.materials (grade_id, format_id);
GRANT SELECT, INSERT, UPDATE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_materials_updated_at ON public.materials;
CREATE TRIGGER trg_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
DROP POLICY IF EXISTS "materials_select" ON public.materials;
CREATE POLICY "materials_select" ON public.materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "materials_insert" ON public.materials;
CREATE POLICY "materials_insert" ON public.materials FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));
DROP POLICY IF EXISTS "materials_update" ON public.materials;
CREATE POLICY "materials_update" ON public.materials FOR UPDATE TO authenticated USING (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', '')) WITH CHECK (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));

INSERT INTO public.materials (grade_id, format_id, dimension_id)
SELECT DISTINCT g.id, f.id, d.id
FROM public.production_steps ps
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ps.raw_material_items) = 'array' THEN ps.raw_material_items ELSE '[]'::jsonb END) AS it
JOIN public.material_grades g ON g.id::text = it->>'gradeId'
JOIN public.material_formats f ON f.id::text = it->>'formatId'
JOIN public.material_dimensions d ON d.id::text = it->>'dimensionId'
ON CONFLICT DO NOTHING;

-- PARTIE 2 : material_purchases
CREATE TABLE IF NOT EXISTS public.material_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  document_ref text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_material_purchases_supplier_date ON public.material_purchases (supplier_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_material_purchases_date ON public.material_purchases (purchase_date DESC);
GRANT SELECT, INSERT, UPDATE ON public.material_purchases TO authenticated;
GRANT ALL ON public.material_purchases TO service_role;
ALTER TABLE public.material_purchases ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_material_purchases_updated_at ON public.material_purchases;
CREATE TRIGGER trg_material_purchases_updated_at BEFORE UPDATE ON public.material_purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
DROP POLICY IF EXISTS "material_purchases_select" ON public.material_purchases;
CREATE POLICY "material_purchases_select" ON public.material_purchases FOR SELECT TO authenticated USING (public.can_read(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS "material_purchases_insert" ON public.material_purchases;
CREATE POLICY "material_purchases_insert" ON public.material_purchases FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS "material_purchases_update" ON public.material_purchases;
CREATE POLICY "material_purchases_update" ON public.material_purchases FOR UPDATE TO authenticated USING (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', '')) WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));

-- material_purchase_lines
CREATE TABLE IF NOT EXISTS public.material_purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.material_purchases(id) ON DELETE RESTRICT,
  line_type text NOT NULL CHECK (line_type IN ('material','component','fee')),
  material_id uuid REFERENCES public.materials(id) ON DELETE RESTRICT,
  component_kind text CHECK (component_kind IN ('fasteners','bearings','other')),
  designation text,
  quantity numeric(14,3) CHECK (quantity > 0),
  unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  unit_price numeric(14,3) CHECK (unit_price >= 0),
  fee_label text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_purchase_lines_type_consistency CHECK (
    (line_type = 'material' AND material_id IS NOT NULL AND quantity IS NOT NULL AND unit_id IS NOT NULL AND unit_price IS NOT NULL
      AND designation IS NULL AND component_kind IS NULL AND fee_label IS NULL)
    OR (line_type = 'component' AND component_kind IS NOT NULL AND designation IS NOT NULL AND btrim(designation) <> '' AND quantity IS NOT NULL AND unit_price IS NOT NULL
      AND material_id IS NULL AND unit_id IS NULL AND fee_label IS NULL)
    OR (line_type = 'fee' AND fee_label IS NOT NULL AND btrim(fee_label) <> ''
      AND material_id IS NULL AND component_kind IS NULL AND designation IS NULL AND quantity IS NULL AND unit_id IS NULL AND unit_price IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_mpl_purchase ON public.material_purchase_lines (purchase_id);
CREATE INDEX IF NOT EXISTS idx_mpl_material ON public.material_purchase_lines (material_id);
CREATE INDEX IF NOT EXISTS idx_mpl_order_item ON public.material_purchase_lines (order_id, order_item_id);
GRANT SELECT, INSERT, UPDATE ON public.material_purchase_lines TO authenticated;
GRANT ALL ON public.material_purchase_lines TO service_role;
ALTER TABLE public.material_purchase_lines ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_material_purchase_lines_updated_at ON public.material_purchase_lines;
CREATE TRIGGER trg_material_purchase_lines_updated_at BEFORE UPDATE ON public.material_purchase_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
DROP POLICY IF EXISTS "material_purchase_lines_select" ON public.material_purchase_lines;
CREATE POLICY "material_purchase_lines_select" ON public.material_purchase_lines FOR SELECT TO authenticated USING (public.can_read(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS "material_purchase_lines_insert" ON public.material_purchase_lines;
CREATE POLICY "material_purchase_lines_insert" ON public.material_purchase_lines FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS "material_purchase_lines_update" ON public.material_purchase_lines;
CREATE POLICY "material_purchase_lines_update" ON public.material_purchase_lines FOR UPDATE TO authenticated USING (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', '')) WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));

-- PARTIE 3 : poids
ALTER TABLE public.material_grades ADD COLUMN IF NOT EXISTS density_id uuid REFERENCES public.material_densities(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_material_grades_density ON public.material_grades (density_id);
ALTER TABLE public.material_formats ADD COLUMN IF NOT EXISTS shape text CHECK (shape IN ('round','hexagon','square','flat','sheet'));
ALTER TABLE public.material_units ADD COLUMN IF NOT EXISTS mm_per_unit numeric(12,3) CHECK (mm_per_unit > 0);
