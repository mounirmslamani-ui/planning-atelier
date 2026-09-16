ALTER TABLE public.production_steps
  ADD COLUMN IF NOT EXISTS non_billable boolean NOT NULL DEFAULT false;
