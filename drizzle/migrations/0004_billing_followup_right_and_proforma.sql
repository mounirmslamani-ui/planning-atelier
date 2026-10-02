INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton, libelle_fr, libelle_ar, is_confidential)
SELECT COALESCE(MAX(ordre),0)+1, 'متابعة فوترة الطلبيات', '', '', '', 'Suivi de facturation des commandes', 'متابعة فوترة الطلبيات', true
FROM public.rights_catalog
ON CONFLICT (tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;

UPDATE public.rights_catalog SET is_confidential = true
WHERE tableau = 'متابعة فوترة الطلبيات' AND formulaire = '' AND sous_formulaire = '' AND champ_bouton = '';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS proforma_number text;

CREATE OR REPLACE FUNCTION public.enforce_rbac_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.material_status IS DISTINCT FROM OLD.material_status
      OR NEW.tooling_status IS DISTINCT FROM OLD.tooling_status
      OR NEW.study_status  IS DISTINCT FROM OLD.study_status)
     AND NOT (
        public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','المواد الأولية')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','العدة')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','الدراسة')
     OR public.can_write(auth.uid(),'','','مراحل الإنجاز والتوقيت','Tous')
     ) THEN
    RAISE EXCEPTION 'RBAC: لا تتوفر لديك صلاحية تعديل حالة الموارد (المواد الأولية / العدة / الدراسة).';
  END IF;

  IF NEW.proforma_number IS DISTINCT FROM OLD.proforma_number
     AND NOT public.can_write(auth.uid(),'متابعة فوترة الطلبيات','','','') THEN
    RAISE EXCEPTION 'RBAC: لا تتوفر لديك صلاحية تعديل الفاتورة الشكلية.';
  END IF;

  RETURN NEW;
END;
$function$;