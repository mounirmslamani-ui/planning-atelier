ALTER TABLE public.orders ALTER COLUMN planned_deadline DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN planned_deadline DROP DEFAULT;