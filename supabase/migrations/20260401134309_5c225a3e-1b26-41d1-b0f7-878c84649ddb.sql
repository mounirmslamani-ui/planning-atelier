
-- Update any existing P5 orders to P4
UPDATE public.orders SET priority = 'P4' WHERE priority = 'P5';

-- Drop the default first
ALTER TABLE public.orders ALTER COLUMN priority DROP DEFAULT;

-- Recreate the enum without P5
ALTER TYPE public.order_priority RENAME TO order_priority_old;
CREATE TYPE public.order_priority AS ENUM ('P1', 'P2', 'P3', 'P4');

-- Update column to use new enum
ALTER TABLE public.orders 
  ALTER COLUMN priority TYPE public.order_priority USING priority::text::public.order_priority;

-- Set default back
ALTER TABLE public.orders ALTER COLUMN priority SET DEFAULT 'P3'::public.order_priority;

-- Drop old enum
DROP TYPE public.order_priority_old;
