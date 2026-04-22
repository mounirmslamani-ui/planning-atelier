ALTER TABLE public.production_records
ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'done';

ALTER TABLE public.production_records
DROP CONSTRAINT IF EXISTS production_records_work_status_check;

ALTER TABLE public.production_records
ADD CONSTRAINT production_records_work_status_check
CHECK (work_status IN ('done', 'continue'));

CREATE INDEX IF NOT EXISTS idx_production_records_step_status
ON public.production_records (step_id, work_status);