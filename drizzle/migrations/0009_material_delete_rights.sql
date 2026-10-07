GRANT DELETE ON public.materials, public.material_suppliers TO authenticated;
DROP POLICY IF EXISTS materials_delete ON public.materials;
CREATE POLICY materials_delete ON public.materials FOR DELETE TO authenticated USING (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));
DROP POLICY IF EXISTS material_suppliers_delete ON public.material_suppliers;
CREATE POLICY material_suppliers_delete ON public.material_suppliers FOR DELETE TO authenticated USING (public.can_write(auth.uid(), 'مرجعيات المادة الأولية', '', '', ''));