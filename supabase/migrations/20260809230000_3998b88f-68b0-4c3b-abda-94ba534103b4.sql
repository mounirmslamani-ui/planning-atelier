ALTER TABLE public.production_steps
  ADD COLUMN IF NOT EXISTS raw_material_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS special_tooling_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.production_steps DISABLE TRIGGER trg_enforce_rbac_production_steps;

UPDATE public.production_steps ps
SET raw_material_items = COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', t.val, 'status', ps.material_status::text))
      FROM unnest(ps.raw_material_needs) AS t(val)
      WHERE btrim(COALESCE(t.val,'')) <> ''
    ), '[]'::jsonb),
    special_tooling_items = COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'label', t.val, 'status', ps.tooling_status::text))
      FROM unnest(ps.special_tooling_needs) AS t(val)
      WHERE btrim(COALESCE(t.val,'')) <> ''
    ), '[]'::jsonb);

ALTER TABLE public.production_steps ENABLE TRIGGER trg_enforce_rbac_production_steps;

ALTER TABLE public.production_steps
  DROP COLUMN raw_material_needs,
  DROP COLUMN special_tooling_needs;