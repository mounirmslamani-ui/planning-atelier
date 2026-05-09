ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phones text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emails text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS phones text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emails text[] NOT NULL DEFAULT '{}';