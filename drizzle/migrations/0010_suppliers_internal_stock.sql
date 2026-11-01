ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_internal_stock boolean NOT NULL DEFAULT false;

UPDATE public.suppliers SET is_internal_stock = true WHERE lower(btrim(name)) = 'stock magasin' AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE is_internal_stock);

INSERT INTO public.suppliers (name, is_internal_stock) SELECT 'Stock magasin', true WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE is_internal_stock);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_single_internal_stock ON public.suppliers ((is_internal_stock)) WHERE is_internal_stock;