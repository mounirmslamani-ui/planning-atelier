CREATE OR REPLACE FUNCTION public.prevent_duplicate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id <> NEW.id
      AND lower(btrim(o.order_number)) = lower(btrim(NEW.order_number))
  ) THEN
    RAISE EXCEPTION 'Erreur : Ce numéro de commande existe déjà. Veuillez utiliser un identifiant unique.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_order_number_trigger ON public.orders;
CREATE TRIGGER prevent_duplicate_order_number_trigger
BEFORE INSERT OR UPDATE OF order_number ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_order_number();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders
    GROUP BY lower(btrim(order_number))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique_ci
    ON public.orders (lower(btrim(order_number)));
  END IF;
END;
$$;