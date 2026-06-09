ALTER TABLE public.production_steps
ADD COLUMN IF NOT EXISTS subcontracting_in_progress boolean NOT NULL DEFAULT false;