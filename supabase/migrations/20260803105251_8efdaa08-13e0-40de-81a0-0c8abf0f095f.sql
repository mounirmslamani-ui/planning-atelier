UPDATE public.user_rights SET niveau_acces = 'RO' WHERE niveau_acces = 'denied';

CREATE OR REPLACE FUNCTION public.populate_user_rights_on_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role <> 'admin' THEN
    INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
    SELECT NEW.id, rc.tableau, rc.formulaire, rc.sous_formulaire, rc.champ_bouton, 'RO'
    FROM public.rights_catalog rc
    ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.user_rights DROP CONSTRAINT IF EXISTS user_rights_niveau_acces_check;
ALTER TABLE public.user_rights ADD CONSTRAINT user_rights_niveau_acces_check
  CHECK (niveau_acces = ANY (ARRAY['RW'::text, 'RO'::text, 'delegate'::text]));