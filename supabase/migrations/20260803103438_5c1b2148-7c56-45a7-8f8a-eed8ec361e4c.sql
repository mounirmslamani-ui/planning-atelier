ALTER TABLE public.rights_catalog
  ADD COLUMN IF NOT EXISTS libelle_fr text,
  ADD COLUMN IF NOT EXISTS libelle_ar text;