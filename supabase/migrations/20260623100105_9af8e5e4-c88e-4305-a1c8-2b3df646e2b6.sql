
-- 1) Add the two new catalog rows (idempotent via WHERE NOT EXISTS).
INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton)
SELECT 26, 'سجل الأعمال المنجزة', '', '', 'تعديل التسجيل'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rights_catalog
  WHERE tableau = 'سجل الأعمال المنجزة' AND formulaire = '' AND sous_formulaire = '' AND champ_bouton = 'تعديل التسجيل'
);

INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton)
SELECT 27, 'سجل الأعمال المنجزة', '', '', 'حذف التسجيل'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rights_catalog
  WHERE tableau = 'سجل الأعمال المنجزة' AND formulaire = '' AND sous_formulaire = '' AND champ_bouton = 'حذف التسجيل'
);

-- 2) Seed user_rights with 'denied' for all non-admin users on the two new entries.
INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
SELECT p.id, 'سجل الأعمال المنجزة', '', '', 'تعديل التسجيل', 'denied'
FROM public.profiles p
WHERE p.role <> 'admin'
ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;

INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
SELECT p.id, 'سجل الأعمال المنجزة', '', '', 'حذف التسجيل', 'denied'
FROM public.profiles p
WHERE p.role <> 'admin'
ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;

-- 3) Grant RW to user حكيم on both new entries.
UPDATE public.user_rights ur
SET niveau_acces = 'RW'
FROM public.profiles p
WHERE ur.user_id = p.id
  AND p.display_name = 'حكيم'
  AND ur.tableau = 'سجل الأعمال المنجزة'
  AND ur.formulaire = ''
  AND ur.sous_formulaire = ''
  AND ur.champ_bouton IN ('تعديل التسجيل', 'حذف التسجيل');
