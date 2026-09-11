ALTER TABLE public.user_rights DROP CONSTRAINT IF EXISTS user_rights_niveau_acces_check;
ALTER TABLE public.user_rights ADD CONSTRAINT user_rights_niveau_acces_check
  CHECK (niveau_acces = ANY (ARRAY['RW'::text, 'RO'::text, 'delegate'::text, 'denied'::text]));