ALTER TABLE public.rights_catalog ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.rights_catalog.is_confidential IS 'true = jamais attribué automatiquement aux nouveaux utilisateurs ; attribution manuelle par l''administrateur uniquement';
UPDATE public.rights_catalog SET is_confidential = true
WHERE tableau = 'أسعار شراء المواد الأولية' AND formulaire = '' AND sous_formulaire = '' AND champ_bouton = '';

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
    WHERE NOT rc.is_confidential
    ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;