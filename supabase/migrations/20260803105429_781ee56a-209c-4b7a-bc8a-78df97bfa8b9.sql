CREATE OR REPLACE FUNCTION public.can_write(
  _uid uuid,
  _tableau text DEFAULT '',
  _formulaire text DEFAULT '',
  _sous_formulaire text DEFAULT '',
  _champ_bouton text DEFAULT ''
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT is_admin(_uid) OR EXISTS (
    SELECT 1 FROM public.user_rights ur
    WHERE ur.user_id = _uid
      AND COALESCE(ur.tableau,'') = COALESCE(_tableau,'')
      AND COALESCE(ur.formulaire,'') = COALESCE(_formulaire,'')
      AND COALESCE(ur.sous_formulaire,'') = COALESCE(_sous_formulaire,'')
      AND COALESCE(ur.champ_bouton,'') = COALESCE(_champ_bouton,'')
      AND ur.niveau_acces = 'RW'
  );
$function$;

-- operators
DROP POLICY IF EXISTS "Authenticated full access operators" ON public.operators;
CREATE POLICY "operators_select" ON public.operators FOR SELECT TO authenticated USING (true);
CREATE POLICY "operators_insert" ON public.operators FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'العمال','','',''));
CREATE POLICY "operators_update" ON public.operators FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'العمال','','','')) WITH CHECK (public.can_write(auth.uid(),'العمال','','',''));
CREATE POLICY "operators_delete" ON public.operators FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'العمال','','',''));

-- clients
DROP POLICY IF EXISTS "Authenticated full access clients" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'الزبائن','','',''));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'الزبائن','','','')) WITH CHECK (public.can_write(auth.uid(),'الزبائن','','',''));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'الزبائن','','',''));

-- holidays
DROP POLICY IF EXISTS "Authenticated full access holidays" ON public.holidays;
CREATE POLICY "holidays_select" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "holidays_insert" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'العطل الرسمية','','',''));
CREATE POLICY "holidays_update" ON public.holidays FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'العطل الرسمية','','','')) WITH CHECK (public.can_write(auth.uid(),'العطل الرسمية','','',''));
CREATE POLICY "holidays_delete" ON public.holidays FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'العطل الرسمية','','',''));

-- subcontractors
DROP POLICY IF EXISTS "Authenticated full access subcontractors" ON public.subcontractors;
CREATE POLICY "subcontractors_select" ON public.subcontractors FOR SELECT TO authenticated USING (true);
CREATE POLICY "subcontractors_insert" ON public.subcontractors FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'المناولون','','',''));
CREATE POLICY "subcontractors_update" ON public.subcontractors FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'المناولون','','','')) WITH CHECK (public.can_write(auth.uid(),'المناولون','','',''));
CREATE POLICY "subcontractors_delete" ON public.subcontractors FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'المناولون','','',''));

-- operations
DROP POLICY IF EXISTS "Authenticated full access operations" ON public.operations;
CREATE POLICY "operations_select" ON public.operations FOR SELECT TO authenticated USING (true);
CREATE POLICY "operations_insert" ON public.operations FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'العمليات','','',''));
CREATE POLICY "operations_update" ON public.operations FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'العمليات','','','')) WITH CHECK (public.can_write(auth.uid(),'العمليات','','',''));
CREATE POLICY "operations_delete" ON public.operations FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'العمليات','','',''));

-- equipments (admin only for writes)
DROP POLICY IF EXISTS "Authenticated full access equipments" ON public.equipments;
CREATE POLICY "equipments_select" ON public.equipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "equipments_insert" ON public.equipments FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "equipments_update" ON public.equipments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "equipments_delete" ON public.equipments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- cancelled_orders
DROP POLICY IF EXISTS "Authenticated full access cancelled_orders" ON public.cancelled_orders;
CREATE POLICY "cancelled_orders_select" ON public.cancelled_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "cancelled_orders_insert" ON public.cancelled_orders FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'','','','إلغاء الطلبية'));
CREATE POLICY "cancelled_orders_delete" ON public.cancelled_orders FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'','','','إعادة إدماج'));

-- quality_control_entries
DROP POLICY IF EXISTS "Authenticated full access quality_control_entries" ON public.quality_control_entries;
CREATE POLICY "qc_entries_select" ON public.quality_control_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "qc_entries_insert" ON public.quality_control_entries FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'','','مراقبة الجودة والتسليم','سجل مراقبة الجودة'));
CREATE POLICY "qc_entries_update" ON public.quality_control_entries FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'','','مراقبة الجودة والتسليم','سجل مراقبة الجودة')) WITH CHECK (public.can_write(auth.uid(),'','','مراقبة الجودة والتسليم','سجل مراقبة الجودة'));
CREATE POLICY "qc_entries_delete" ON public.quality_control_entries FOR DELETE TO authenticated USING (
  public.can_write(auth.uid(),'','','مراقبة الجودة والتسليم','سجل مراقبة الجودة')
  OR public.can_write(auth.uid(),'','','','حذف جلسة')
  OR public.can_write(auth.uid(),'','','','إعادة إدماج')
  OR (decision IS NULL AND COALESCE(pending_qty,0) > 0)
);

-- delivered_orders
DROP POLICY IF EXISTS "Authenticated full access delivered_orders" ON public.delivered_orders;
CREATE POLICY "delivered_orders_select" ON public.delivered_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivered_orders_insert" ON public.delivered_orders FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(),'','','','التسليم'));
CREATE POLICY "delivered_orders_update" ON public.delivered_orders FOR UPDATE TO authenticated USING (public.can_write(auth.uid(),'','','','التسليم')) WITH CHECK (public.can_write(auth.uid(),'','','','التسليم'));
CREATE POLICY "delivered_orders_delete" ON public.delivered_orders FOR DELETE TO authenticated USING (public.can_write(auth.uid(),'','','','حذف جلسة'));