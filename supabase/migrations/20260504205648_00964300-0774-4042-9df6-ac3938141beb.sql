-- Add category column to classify orders for the registry tabs
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'fabrication';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_category_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_category_check CHECK (category IN ('fabrication','prestation','divers','slamani'));
CREATE INDEX IF NOT EXISTS idx_orders_category ON public.orders(category);