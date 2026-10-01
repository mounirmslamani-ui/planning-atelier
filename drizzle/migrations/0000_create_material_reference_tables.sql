-- Right used for writing to material reference tables
INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton, libelle_fr, libelle_ar)
VALUES (29, 'مرجعيات المادة الأولية', '', '', '', 'Référentiels matière première (nuances, formats, dimensions, unités, masses volumiques, fournisseurs)', 'مرجعيات المادة الأولية (الأنواع، الأشكال، الأبعاد، الوحدات، الكتل الحجمية، الموردون)')
ON CONFLICT (tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;

CREATE TABLE public.material_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle_fr text NOT NULL,
  libelle_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.material_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle_fr text NOT NULL,
  libelle_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.material_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle_fr text NOT NULL,
  libelle_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.material_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.material_densities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle text NOT NULL,
  value numeric(8,3) NOT NULL CHECK (value > 0),
  unit text NOT NULL DEFAULT 'g/cm3',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX material_grades_libelle_fr_unique_ci ON public.material_grades (lower(btrim(libelle_fr)));
CREATE UNIQUE INDEX material_formats_libelle_fr_unique_ci ON public.material_formats (lower(btrim(libelle_fr)));
CREATE UNIQUE INDEX material_units_libelle_fr_unique_ci ON public.material_units (lower(btrim(libelle_fr)));
CREATE UNIQUE INDEX material_dimensions_libelle_unique_ci ON public.material_dimensions (lower(btrim(libelle)));
CREATE UNIQUE INDEX material_densities_libelle_unique_ci ON public.material_densities (lower(btrim(libelle)));
CREATE UNIQUE INDEX suppliers_name_unique_ci ON public.suppliers (lower(btrim(name)));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['material_grades','material_formats','material_units','material_dimensions','material_densities','suppliers'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp()', t || '_set_updated_at', t);
    EXECUTE format('CREATE POLICY "Authenticated can read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Rights holders can insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), %L, '''', '''', ''''))', t, 'مرجعيات المادة الأولية');
    EXECUTE format('CREATE POLICY "Rights holders can update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write(auth.uid(), %L, '''', '''', '''')) WITH CHECK (public.can_write(auth.uid(), %L, '''', '''', ''''))', t, 'مرجعيات المادة الأولية', 'مرجعيات المادة الأولية');
  END LOOP;
END $$;