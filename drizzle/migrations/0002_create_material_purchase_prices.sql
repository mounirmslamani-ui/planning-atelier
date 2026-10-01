INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton, libelle_fr, libelle_ar)
SELECT COALESCE(MAX(ordre),0)+1, 'أسعار شراء المواد الأولية', '', '', '', 'Prix d''achat matières', 'أسعار شراء المواد الأولية'
FROM public.rights_catalog
ON CONFLICT (tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_read(_uid uuid, _tableau text DEFAULT ''::text, _formulaire text DEFAULT ''::text, _sous_formulaire text DEFAULT ''::text, _champ_bouton text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(_uid) OR EXISTS (
    SELECT 1 FROM public.user_rights ur
    WHERE ur.user_id = _uid
      AND COALESCE(ur.tableau,'') = COALESCE(_tableau,'')
      AND COALESCE(ur.formulaire,'') = COALESCE(_formulaire,'')
      AND COALESCE(ur.sous_formulaire,'') = COALESCE(_sous_formulaire,'')
      AND COALESCE(ur.champ_bouton,'') = COALESCE(_champ_bouton,'')
      AND ur.niveau_acces IN ('RO','RW')
  );
$function$;

CREATE TABLE public.material_purchase_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL,
  grade_id uuid NOT NULL REFERENCES public.material_grades(id) ON DELETE RESTRICT,
  format_id uuid NOT NULL REFERENCES public.material_formats(id) ON DELETE RESTRICT,
  dimension_id uuid REFERENCES public.material_dimensions(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  unit_price numeric(14,3) NOT NULL CHECK (unit_price >= 0),
  price_unit_id uuid NOT NULL REFERENCES public.material_units(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'DZD',
  quantity numeric(14,3) CHECK (quantity IS NULL OR quantity > 0),
  document_ref text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mpp_grade_format_dim_date_idx ON public.material_purchase_prices (grade_id, format_id, dimension_id, purchase_date DESC);
CREATE INDEX mpp_supplier_date_idx ON public.material_purchase_prices (supplier_id, purchase_date DESC);
CREATE INDEX mpp_date_idx ON public.material_purchase_prices (purchase_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.material_purchase_prices TO authenticated;
GRANT ALL ON public.material_purchase_prices TO service_role;
ALTER TABLE public.material_purchase_prices ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER material_purchase_prices_set_updated_at BEFORE UPDATE ON public.material_purchase_prices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE POLICY "Rights holders can read" ON public.material_purchase_prices FOR SELECT TO authenticated
USING (public.can_read(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
CREATE POLICY "Rights holders can insert" ON public.material_purchase_prices FOR INSERT TO authenticated
WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
CREATE POLICY "Rights holders can update" ON public.material_purchase_prices FOR UPDATE TO authenticated
USING (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''))
WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));

CREATE VIEW public.material_last_purchase_price WITH (security_invoker = true) AS
SELECT DISTINCT ON (p.grade_id, p.format_id, p.dimension_id, p.price_unit_id)
  p.*, s.name AS supplier_name
FROM public.material_purchase_prices p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE p.is_active
ORDER BY p.grade_id, p.format_id, p.dimension_id, p.price_unit_id, p.purchase_date DESC, p.created_at DESC;

GRANT SELECT ON public.material_last_purchase_price TO authenticated;
GRANT SELECT ON public.material_last_purchase_price TO service_role;