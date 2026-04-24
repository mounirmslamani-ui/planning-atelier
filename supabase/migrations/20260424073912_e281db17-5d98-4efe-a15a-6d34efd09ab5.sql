CREATE TYPE public.sale_price_status AS ENUM ('gratuit', 'non-calcule', 'non-valide', 'valide');

CREATE TABLE public.delivered_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sale_price_status public.sale_price_status NOT NULL DEFAULT 'non-calcule',
  observation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivered_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to delivered_orders"
ON public.delivered_orders
FOR ALL
USING (true)
WITH CHECK (true);