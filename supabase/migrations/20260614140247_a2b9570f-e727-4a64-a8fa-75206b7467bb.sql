
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS technical_complexity text;

UPDATE public.rights_catalog
SET sous_formulaire = 'معلومات الطلبية والزبون'
WHERE sous_formulaire = 'معلومات الطلب والزبون';

UPDATE public.user_rights
SET sous_formulaire = 'معلومات الطلبية والزبون'
WHERE sous_formulaire = 'معلومات الطلب والزبون';
