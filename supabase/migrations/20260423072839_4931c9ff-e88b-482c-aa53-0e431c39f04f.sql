CREATE OR REPLACE FUNCTION public.prevent_duplicate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND lower(btrim(NEW.order_number)) = lower(btrim(OLD.order_number)) THEN
    RETURN NEW;
  END IF;

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