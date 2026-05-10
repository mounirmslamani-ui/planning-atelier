ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reintegrated_at timestamptz;
UPDATE public.orders SET reintegrated_at = COALESCE(reintegrated_at, updated_at, now()) WHERE observation LIKE '%⟲ Reprise/Retouche%';
UPDATE public.orders SET reintegrated_at = COALESCE(reintegrated_at, now()) WHERE order_number = '26/P146';