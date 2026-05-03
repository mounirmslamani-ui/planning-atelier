CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.cancelled_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL UNIQUE,
  order_number_snapshot TEXT NOT NULL,
  client_name_snapshot TEXT,
  designation_snapshot TEXT NOT NULL,
  quantity_snapshot INTEGER NOT NULL DEFAULT 1,
  order_date_snapshot DATE,
  cancel_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cancelled_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cancelled_orders"
ON public.cancelled_orders
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER cancelled_orders_set_updated_at
BEFORE UPDATE ON public.cancelled_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();