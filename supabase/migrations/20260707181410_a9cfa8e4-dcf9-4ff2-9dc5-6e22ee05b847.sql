ALTER TABLE public.production_steps ADD COLUMN IF NOT EXISTS shift_started_date date;
ALTER TABLE public.production_steps ADD COLUMN IF NOT EXISTS shift_ended_date date;