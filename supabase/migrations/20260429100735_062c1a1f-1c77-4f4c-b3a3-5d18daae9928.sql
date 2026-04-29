WITH ranked_delivery_entries AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY order_id
      ORDER BY moved_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS duplicate_rank
  FROM public.delivery_entries
)
DELETE FROM public.delivery_entries de
USING ranked_delivery_entries r
WHERE de.id = r.id
  AND r.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_entries_order_id_unique
ON public.delivery_entries (order_id);