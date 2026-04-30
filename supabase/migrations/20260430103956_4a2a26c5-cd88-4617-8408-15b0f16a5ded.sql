ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS order_number_snapshot text,
  ADD COLUMN IF NOT EXISTS client_name_snapshot text,
  ADD COLUMN IF NOT EXISTS designation_snapshot text,
  ADD COLUMN IF NOT EXISTS quantity_snapshot integer,
  ADD COLUMN IF NOT EXISTS operation_name_snapshot text;

UPDATE public.production_records pr
SET
  order_number_snapshot = COALESCE(pr.order_number_snapshot, o.order_number),
  client_name_snapshot  = COALESCE(pr.client_name_snapshot, c.name),
  designation_snapshot  = COALESCE(pr.designation_snapshot, o.designation),
  quantity_snapshot     = COALESCE(pr.quantity_snapshot, o.quantity)
FROM public.orders o
LEFT JOIN public.clients c ON c.id = o.client_id
WHERE pr.order_id = o.id;

UPDATE public.production_records pr
SET operation_name_snapshot = op.name
FROM public.operations op
WHERE pr.operation_id = op.id
  AND pr.operation_name_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.populate_production_record_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number_snapshot IS NULL OR NEW.client_name_snapshot IS NULL
     OR NEW.designation_snapshot IS NULL OR NEW.quantity_snapshot IS NULL THEN
    SELECT
      COALESCE(NEW.order_number_snapshot, o.order_number),
      COALESCE(NEW.client_name_snapshot,  c.name),
      COALESCE(NEW.designation_snapshot,  o.designation),
      COALESCE(NEW.quantity_snapshot,     o.quantity)
    INTO NEW.order_number_snapshot, NEW.client_name_snapshot,
         NEW.designation_snapshot, NEW.quantity_snapshot
    FROM public.orders o
    LEFT JOIN public.clients c ON c.id = o.client_id
    WHERE o.id = NEW.order_id;
  END IF;

  IF NEW.operation_name_snapshot IS NULL THEN
    SELECT name INTO NEW.operation_name_snapshot
    FROM public.operations WHERE id = NEW.operation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_production_record_snapshots ON public.production_records;
CREATE TRIGGER trg_populate_production_record_snapshots
BEFORE INSERT ON public.production_records
FOR EACH ROW EXECUTE FUNCTION public.populate_production_record_snapshots();