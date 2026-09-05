ALTER TABLE public.production_steps
  ADD COLUMN IF NOT EXISTS subcontracting_cost numeric(12,2),
  ADD COLUMN IF NOT EXISTS subcontracting_margin smallint CHECK (subcontracting_margin IN (30,50)),
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sale_price_per_unit numeric(12,2);

INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton, libelle_fr, libelle_ar)
SELECT COALESCE(MAX(ordre), 0) + 1, '', '', 'حساب التكلفة/ثمن البيع', 'Tous',
       'Calcul du coût / prix de vente', 'حساب التكلفة/ثمن البيع'
FROM public.rights_catalog
ON CONFLICT (tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;