-- 1. Create new enum for 4-state resource status
CREATE TYPE public.resource_status AS ENUM ('disponible', 'non-disponible', 'partiel', 'non-applicable');

-- 2. ORDERS table: add new status columns
ALTER TABLE public.orders
  ADD COLUMN material_status public.resource_status NOT NULL DEFAULT 'non-disponible',
  ADD COLUMN tooling_status public.resource_status NOT NULL DEFAULT 'non-disponible',
  ADD COLUMN study_status public.resource_status NOT NULL DEFAULT 'non-disponible';

-- Migrate existing boolean data: true => disponible, false => non-disponible
UPDATE public.orders SET
  material_status = CASE WHEN material_available THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END,
  tooling_status  = CASE WHEN tooling_available  THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END,
  study_status    = CASE WHEN study_ready        THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END;

-- Drop old boolean columns
ALTER TABLE public.orders
  DROP COLUMN material_available,
  DROP COLUMN tooling_available,
  DROP COLUMN study_ready;

-- 3. PRODUCTION_STEPS table: add new status columns
ALTER TABLE public.production_steps
  ADD COLUMN material_status public.resource_status NOT NULL DEFAULT 'disponible',
  ADD COLUMN tooling_status public.resource_status NOT NULL DEFAULT 'disponible',
  ADD COLUMN study_status public.resource_status NOT NULL DEFAULT 'disponible';

-- Migrate existing boolean data
UPDATE public.production_steps SET
  material_status = CASE WHEN material_available THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END,
  tooling_status  = CASE WHEN tooling_available  THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END,
  study_status    = CASE WHEN study_ready        THEN 'disponible'::public.resource_status ELSE 'non-disponible'::public.resource_status END;

-- Drop old boolean columns
ALTER TABLE public.production_steps
  DROP COLUMN material_available,
  DROP COLUMN tooling_available,
  DROP COLUMN study_ready;

-- 4. Remove subcontracting columns from production_steps (column is removed from "Définition des tâches")
ALTER TABLE public.production_steps
  DROP COLUMN subcontracting_done,
  DROP COLUMN subcontracting_deadline;