-- PARTIE 1
CREATE SEQUENCE IF NOT EXISTS public.materials_code_seq;
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS order_unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS purchase_unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.materials
)
UPDATE public.materials m SET code = 'Id' || to_char(r.rn, 'FM0000')
FROM ranked r WHERE m.id = r.id AND m.code IS NULL;

SELECT setval('public.materials_code_seq',
  COALESCE((SELECT MAX(substring(code from 3)::int) FROM public.materials WHERE code ~ '^Id[0-9]+$'), 0) + 1, false);

ALTER TABLE public.materials ALTER COLUMN code SET DEFAULT 'Id' || to_char(nextval('public.materials_code_seq'), 'FM0000');
ALTER TABLE public.materials ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS materials_code_unique ON public.materials(code);
GRANT USAGE, SELECT ON SEQUENCE public.materials_code_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.materials_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'L''identifiant matière (code) ne peut pas être modifié';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS materials_code_immutable_trg ON public.materials;
CREATE TRIGGER materials_code_immutable_trg BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.materials_code_immutable();

-- PARTIE 2
CREATE TABLE IF NOT EXISTS public.material_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_suppliers_unique UNIQUE (material_id, supplier_id)
);
GRANT SELECT, INSERT, UPDATE ON public.material_suppliers TO authenticated;
GRANT ALL ON public.material_suppliers TO service_role;
CREATE INDEX IF NOT EXISTS material_suppliers_supplier_idx ON public.material_suppliers(supplier_id);
DROP TRIGGER IF EXISTS material_suppliers_updated_at ON public.material_suppliers;
CREATE TRIGGER material_suppliers_updated_at BEFORE UPDATE ON public.material_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
ALTER TABLE public.material_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_suppliers_select ON public.material_suppliers;
CREATE POLICY material_suppliers_select ON public.material_suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS material_suppliers_insert ON public.material_suppliers;
CREATE POLICY material_suppliers_insert ON public.material_suppliers FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));
DROP POLICY IF EXISTS material_suppliers_update ON public.material_suppliers;
CREATE POLICY material_suppliers_update ON public.material_suppliers FOR UPDATE TO authenticated
  USING (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''))
  WITH CHECK (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));

-- PARTIE 3
ALTER TABLE public.material_purchase_lines
  ADD COLUMN IF NOT EXISTS related_line_id uuid REFERENCES public.material_purchase_lines(id) ON DELETE RESTRICT;
ALTER TABLE public.material_purchase_lines DROP CONSTRAINT IF EXISTS material_purchase_lines_related_only_fee;
ALTER TABLE public.material_purchase_lines ADD CONSTRAINT material_purchase_lines_related_only_fee
  CHECK (related_line_id IS NULL OR line_type = 'fee');
CREATE INDEX IF NOT EXISTS material_purchase_lines_related_idx ON public.material_purchase_lines(related_line_id);

-- PARTIE 4
DROP VIEW IF EXISTS public.material_supplier_last_prices;
CREATE VIEW public.material_supplier_last_prices WITH (security_invoker = true) AS
SELECT ms.id AS material_supplier_id, ms.material_id, ms.supplier_id, s.name AS supplier_name, ms.is_active,
  lp.purchase_date AS last_price_date, lp.unit_price AS last_unit_price, lp.unit_id AS last_price_unit_id,
  u.libelle_fr AS last_price_unit_label,
  lf.purchase_date AS last_fee_date, lf.amount AS last_fee_amount, lf.fee_label AS last_fee_label
FROM public.material_suppliers ms
JOIN public.suppliers s ON s.id = ms.supplier_id
LEFT JOIN LATERAL (
  SELECT p.purchase_date, l.unit_price, l.unit_id
  FROM public.material_purchase_lines l
  JOIN public.material_purchases p ON p.id = l.purchase_id
  WHERE l.line_type = 'material' AND l.material_id = ms.material_id AND p.supplier_id = ms.supplier_id
    AND l.is_active AND p.is_active
  ORDER BY p.purchase_date DESC, l.created_at DESC LIMIT 1
) lp ON true
LEFT JOIN public.material_units u ON u.id = lp.unit_id
LEFT JOIN LATERAL (
  SELECT p.purchase_date, f.amount, f.fee_label
  FROM public.material_purchase_lines f
  JOIN public.material_purchase_lines ml ON ml.id = f.related_line_id
  JOIN public.material_purchases p ON p.id = f.purchase_id
  WHERE f.line_type = 'fee' AND f.related_line_id IS NOT NULL
    AND ml.material_id = ms.material_id AND p.supplier_id = ms.supplier_id
    AND f.is_active AND p.is_active
  ORDER BY p.purchase_date DESC, f.created_at DESC LIMIT 1
) lf ON true;
GRANT SELECT ON public.material_supplier_last_prices TO authenticated, service_role;

-- PARTIE 5
CREATE OR REPLACE FUNCTION public.record_material_purchase(
  p_material_id uuid, p_supplier_id uuid, p_purchase_date date, p_quantity numeric,
  p_unit_id uuid, p_unit_price numeric, p_fee_amount numeric DEFAULT NULL,
  p_fee_label text DEFAULT NULL, p_document_ref text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_purchase uuid; v_line uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'La quantité doit être > 0'; END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'Le prix unitaire doit être >= 0'; END IF;
  INSERT INTO public.material_purchases (purchase_date, supplier_id, document_ref)
    VALUES (p_purchase_date, p_supplier_id, p_document_ref) RETURNING id INTO v_purchase;
  INSERT INTO public.material_purchase_lines (purchase_id, line_type, material_id, quantity, unit_id, unit_price, amount)
    VALUES (v_purchase, 'material', p_material_id, p_quantity, p_unit_id, p_unit_price, round(p_quantity * p_unit_price, 2))
    RETURNING id INTO v_line;
  IF p_fee_amount IS NOT NULL AND p_fee_amount > 0 THEN
    INSERT INTO public.material_purchase_lines (purchase_id, line_type, fee_label, amount, related_line_id)
      VALUES (v_purchase, 'fee', COALESCE(NULLIF(btrim(p_fee_label), ''), 'Frais de découpe'), p_fee_amount, v_line);
  END IF;
  RETURN v_purchase;
END $$;
GRANT EXECUTE ON FUNCTION public.record_material_purchase(uuid, uuid, date, numeric, uuid, numeric, numeric, text, text) TO authenticated, service_role;