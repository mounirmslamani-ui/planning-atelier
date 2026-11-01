CREATE TABLE IF NOT EXISTS public.material_purchase_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.material_purchases(id) ON DELETE RESTRICT,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpa_purchase ON public.material_purchase_attachments (purchase_id);
GRANT SELECT, INSERT ON public.material_purchase_attachments TO authenticated;
GRANT ALL ON public.material_purchase_attachments TO service_role;
REVOKE ALL ON public.material_purchase_attachments FROM anon;
ALTER TABLE public.material_purchase_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpa_select ON public.material_purchase_attachments;
CREATE POLICY mpa_select ON public.material_purchase_attachments FOR SELECT TO authenticated
  USING (public.can_read(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS mpa_insert ON public.material_purchase_attachments;
CREATE POLICY mpa_insert ON public.material_purchase_attachments FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));

DROP POLICY IF EXISTS purchase_documents_objects_select ON storage.objects;
CREATE POLICY purchase_documents_objects_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-documents' AND public.can_read(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS purchase_documents_objects_insert ON storage.objects;
CREATE POLICY purchase_documents_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'purchase-documents' AND public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));
DROP POLICY IF EXISTS purchase_documents_objects_delete ON storage.objects;
CREATE POLICY purchase_documents_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'purchase-documents' AND public.can_write(auth.uid(), 'أسعار شراء المواد الأولية', '', '', ''));