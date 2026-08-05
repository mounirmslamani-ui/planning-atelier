ALTER TABLE public.production_steps DISABLE TRIGGER USER;

WITH ranked AS (
  SELECT id, order_id,
         row_number() OVER (PARTITION BY order_id ORDER BY step_order NULLS LAST, created_at, id) AS rn
  FROM public.production_steps
  WHERE order_id IN (
    SELECT order_id FROM public.production_steps
    GROUP BY order_id, step_order HAVING count(*) > 1
  )
)
UPDATE public.production_steps ps
SET step_order = r.rn
FROM ranked r
WHERE ps.id = r.id AND ps.step_order IS DISTINCT FROM r.rn;

ALTER TABLE public.production_steps ENABLE TRIGGER USER;