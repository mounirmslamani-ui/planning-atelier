-- Two-step shift to satisfy unique(ordre) constraint
UPDATE public.rights_catalog SET ordre = ordre + 1000;
UPDATE public.rights_catalog SET ordre = ordre - 999;

INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton)
VALUES (1, 'سجل الطلبيات', '', '', 'طلبية جديدة');

INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
SELECT p.id, rc.tableau, rc.formulaire, rc.sous_formulaire, rc.champ_bouton, 'denied'
FROM public.profiles p
CROSS JOIN public.rights_catalog rc
WHERE p.role <> 'admin'
ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;