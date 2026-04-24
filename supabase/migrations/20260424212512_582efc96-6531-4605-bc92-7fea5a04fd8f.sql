-- Add new columns to orders table for client representative, instructions, and drawing/model
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_representative text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS drawing_model text;

-- Add new columns to production_steps for special tooling needs and raw material needs
ALTER TABLE public.production_steps
  ADD COLUMN IF NOT EXISTS special_tooling_needs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS raw_material_needs text[] NOT NULL DEFAULT '{}';