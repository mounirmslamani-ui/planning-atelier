ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS hourly_rate_1 numeric(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate_2 numeric(10,2);