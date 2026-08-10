ALTER TABLE public.production_steps
  ADD COLUMN IF NOT EXISTS raw_material_not_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_tooling_not_applicable boolean NOT NULL DEFAULT false;