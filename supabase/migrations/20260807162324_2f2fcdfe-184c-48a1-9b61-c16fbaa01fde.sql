CREATE TABLE public.order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_attachments_order_id ON public.order_attachments(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_attachments TO authenticated;
GRANT ALL ON public.order_attachments TO service_role;
REVOKE ALL ON public.order_attachments FROM anon;

ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_attachments_select" ON public.order_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "order_attachments_insert" ON public.order_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'));

CREATE POLICY "order_attachments_update" ON public.order_attachments
  FOR UPDATE TO authenticated
  USING (public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'))
  WITH CHECK (public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'));

CREATE POLICY "order_attachments_delete" ON public.order_attachments
  FOR DELETE TO authenticated
  USING (public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'));

CREATE POLICY "order_attachments_objects_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'order-attachments');

CREATE POLICY "order_attachments_objects_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-attachments' AND public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'));

CREATE POLICY "order_attachments_objects_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-attachments' AND public.can_write(auth.uid(),'Tous','بطاقة متابعة إنجاز الطلبية','معلومات الطلبية والزبون','Tous'));