ALTER TABLE public.production_steps
ADD COLUMN IF NOT EXISTS study_completed_date DATE,
ADD COLUMN IF NOT EXISTS tooling_received_date DATE;