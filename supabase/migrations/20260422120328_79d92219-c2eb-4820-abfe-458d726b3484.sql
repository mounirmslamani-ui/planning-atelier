ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS material_received_date date;

ALTER TABLE public.production_steps
ADD COLUMN IF NOT EXISTS subcontracting_done boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS subcontracting_received_date date,
ADD COLUMN IF NOT EXISTS subcontracting_deadline date;