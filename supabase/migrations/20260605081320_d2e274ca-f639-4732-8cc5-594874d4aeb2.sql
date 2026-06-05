
ALTER TABLE public.quality_control_entries
  ADD COLUMN IF NOT EXISTS controlled_qty integer,
  ADD COLUMN IF NOT EXISTS accepted_qty integer,
  ADD COLUMN IF NOT EXISTS rejected_qty integer,
  ADD COLUMN IF NOT EXISTS force_closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.delivery_entries
  ADD COLUMN IF NOT EXISTS delivered_qty integer,
  ADD COLUMN IF NOT EXISTS force_closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.delivered_orders
  ADD COLUMN IF NOT EXISTS delivered_qty integer,
  ADD COLUMN IF NOT EXISTS force_closed boolean NOT NULL DEFAULT false;
