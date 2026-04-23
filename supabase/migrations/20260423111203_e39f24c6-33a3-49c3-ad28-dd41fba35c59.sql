ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS manual_sort_order integer;

CREATE INDEX IF NOT EXISTS idx_orders_manual_sort_order
ON public.orders (manual_sort_order)
WHERE manual_sort_order IS NOT NULL;