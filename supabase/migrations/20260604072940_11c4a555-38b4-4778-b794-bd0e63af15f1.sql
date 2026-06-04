
-- 1. Remove QC entries for orders already in delivery_entries or delivered_orders
DELETE FROM public.quality_control_entries qc
WHERE EXISTS (SELECT 1 FROM public.delivered_orders d WHERE d.order_id = qc.order_id)
   OR EXISTS (SELECT 1 FROM public.delivery_entries de WHERE de.order_id = qc.order_id);

-- 2. Deduplicate: keep the most recent QC entry per order
DELETE FROM public.quality_control_entries qc
USING public.quality_control_entries qc2
WHERE qc.order_id = qc2.order_id
  AND qc.created_at < qc2.created_at;

-- Also handle ties on created_at (keep smallest id)
DELETE FROM public.quality_control_entries qc
USING public.quality_control_entries qc2
WHERE qc.order_id = qc2.order_id
  AND qc.created_at = qc2.created_at
  AND qc.id > qc2.id;

-- 3. Enforce uniqueness: one QC entry per order
CREATE UNIQUE INDEX IF NOT EXISTS quality_control_entries_order_id_uniq
  ON public.quality_control_entries(order_id);
