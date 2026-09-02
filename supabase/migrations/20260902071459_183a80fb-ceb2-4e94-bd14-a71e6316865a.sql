ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS non_billable_hours numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS non_billable_reason text,
  ADD COLUMN IF NOT EXISTS billable_hours numeric(6,2);

ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_non_billable_reason_required
  CHECK (non_billable_hours = 0 OR (non_billable_reason IS NOT NULL AND btrim(non_billable_reason) <> ''));

ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_non_billable_not_exceed_actual
  CHECK (non_billable_hours <= ROUND(COALESCE(actual_duration, 0) / 60.0, 2) + 0.01);

CREATE OR REPLACE FUNCTION public.compute_billable_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.billable_hours := GREATEST(
    0,
    ROUND(COALESCE(NEW.actual_duration, 0) / 60.0, 2) - COALESCE(NEW.non_billable_hours, 0)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_billable_hours ON public.production_records;
CREATE TRIGGER trg_compute_billable_hours
BEFORE INSERT OR UPDATE ON public.production_records
FOR EACH ROW EXECUTE FUNCTION public.compute_billable_hours();

UPDATE public.production_records
SET billable_hours = ROUND(actual_duration / 60.0, 2)
WHERE billable_hours IS NULL;