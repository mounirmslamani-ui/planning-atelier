
-- 1) Deduplicate delivered_orders: keep the row with invoice_number (if any), else earliest created_at
WITH ranked AS (
  SELECT id, order_id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY (invoice_number IS NULL), created_at ASC
         ) AS rn
  FROM public.delivered_orders
)
DELETE FROM public.delivered_orders d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

-- 2) Deduplicate delivery_entries defensively (keep earliest)
WITH ranked AS (
  SELECT id, order_id,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC) AS rn
  FROM public.delivery_entries
)
DELETE FROM public.delivery_entries d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

-- 3) Deduplicate cancelled_orders defensively (keep earliest)
WITH ranked AS (
  SELECT id, order_id,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC) AS rn
  FROM public.cancelled_orders
)
DELETE FROM public.cancelled_orders d
USING ranked r
WHERE d.id = r.id AND r.rn > 1;

-- 4) Unique indices to prevent future duplicates at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS delivered_orders_order_id_unique
  ON public.delivered_orders(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_entries_order_id_unique
  ON public.delivery_entries(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS cancelled_orders_order_id_unique
  ON public.cancelled_orders(order_id);
