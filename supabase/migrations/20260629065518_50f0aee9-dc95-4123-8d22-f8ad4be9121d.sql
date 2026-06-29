
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS activity text;

UPDATE public.clients
SET representatives = (
  SELECT jsonb_agg(rep - 'addresses')
  FROM jsonb_array_elements(representatives) AS rep
)
WHERE representatives IS NOT NULL
  AND jsonb_typeof(representatives) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(representatives) AS rep
    WHERE rep ? 'addresses'
  );
