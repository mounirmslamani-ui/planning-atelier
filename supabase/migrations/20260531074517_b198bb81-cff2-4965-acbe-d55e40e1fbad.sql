
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cancelled_orders','clients','delivered_orders','delivery_entries',
    'equipments','holidays','operations','operators','orders',
    'production_records','production_steps','quality_control_entries','subcontractors'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access to %s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access %s" ON public.%I;', t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('CREATE POLICY "Authenticated full access %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;
