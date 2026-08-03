CREATE OR REPLACE FUNCTION public.enforce_rbac_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.material_status IS DISTINCT FROM OLD.material_status
      OR NEW.tooling_status IS DISTINCT FROM OLD.tooling_status
      OR NEW.study_status  IS DISTINCT FROM OLD.study_status)
     AND NOT (
        public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','المواد الأولية')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','العدة')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','الدراسة')
     OR public.can_write(auth.uid(),'','','مراحل الإنجاز والتوقيت','Tous')
     ) THEN
    RAISE EXCEPTION 'RBAC: لا تتوفر لديك صلاحية تعديل حالة الموارد (المواد الأولية / العدة / الدراسة).';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_rbac_orders ON public.orders;
CREATE TRIGGER trg_enforce_rbac_orders
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_rbac_orders();

CREATE OR REPLACE FUNCTION public.enforce_rbac_production_steps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Bloc 1 : statuts des ressources
  IF (NEW.material_status IS DISTINCT FROM OLD.material_status
      OR NEW.tooling_status IS DISTINCT FROM OLD.tooling_status
      OR NEW.study_status  IS DISTINCT FROM OLD.study_status)
     AND NOT (
        public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','المواد الأولية')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','العدة')
     OR public.can_write(auth.uid(),'','','تحضير الطلبية والموارد','الدراسة')
     OR public.can_write(auth.uid(),'','','مراحل الإنجاز والتوقيت','Tous')
     ) THEN
    RAISE EXCEPTION 'RBAC: لا تتوفر لديك صلاحية تعديل حالة الموارد (المواد الأولية / العدة / الدراسة).';
  END IF;

  -- Bloc 2 : ordre de programmation
  IF (NEW.planning_order IS DISTINCT FROM OLD.planning_order
      OR NEW.step_order IS DISTINCT FROM OLD.step_order)
     AND NOT public.can_write(auth.uid(),'جدول البرمجة','','تغيير ترتيب الطلبيات في البرمجة','') THEN
    RAISE EXCEPTION 'RBAC: لا تتوفر لديك صلاحية تغيير ترتيب الطلبيات في البرمجة.';
  END IF;

  -- Bloc 3 : relais de poste — OBSERVATION SEULE, aucun blocage
  IF (NEW.shift_started_date IS DISTINCT FROM OLD.shift_started_date
      OR NEW.shift_ended_date IS DISTINCT FROM OLD.shift_ended_date)
     AND NOT public.can_write(auth.uid(),'','بداية / تبديل / نهاية الدوام','','') THEN
    INSERT INTO public.audit_log(user_id, action, details)
    VALUES (auth.uid(), 'SHADOW_RBAC_WOULD_BLOCK',
            jsonb_build_object('table','production_steps','champ','shift','order_id', NEW.order_id));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_rbac_production_steps ON public.production_steps;
CREATE TRIGGER trg_enforce_rbac_production_steps
BEFORE UPDATE ON public.production_steps
FOR EACH ROW EXECUTE FUNCTION public.enforce_rbac_production_steps();