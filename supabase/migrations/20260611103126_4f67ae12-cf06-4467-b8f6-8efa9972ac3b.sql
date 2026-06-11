
-- ============================================================
-- PHASE 1 : Sessions utilisateurs, droits granulaires, audit
-- Idempotent — préserve les données existantes.
-- ============================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  force_password_change boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. RIGHTS CATALOG (référentiel des 20 lignes)
CREATE TABLE IF NOT EXISTS public.rights_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordre int NOT NULL UNIQUE,
  tableau text NOT NULL DEFAULT '',
  formulaire text NOT NULL DEFAULT '',
  sous_formulaire text NOT NULL DEFAULT '',
  champ_bouton text NOT NULL DEFAULT '',
  UNIQUE (tableau, formulaire, sous_formulaire, champ_bouton)
);

GRANT SELECT ON public.rights_catalog TO authenticated;
GRANT ALL ON public.rights_catalog TO service_role;

ALTER TABLE public.rights_catalog ENABLE ROW LEVEL SECURITY;

-- 3. USER RIGHTS
CREATE TABLE IF NOT EXISTS public.user_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tableau text NOT NULL DEFAULT '',
  formulaire text NOT NULL DEFAULT '',
  sous_formulaire text NOT NULL DEFAULT '',
  champ_bouton text NOT NULL DEFAULT '',
  niveau_acces text NOT NULL DEFAULT 'denied' CHECK (niveau_acces IN ('RW','RO','delegate','denied')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tableau, formulaire, sous_formulaire, champ_bouton)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_rights TO authenticated;
GRANT ALL ON public.user_rights TO service_role;

ALTER TABLE public.user_rights ENABLE ROW LEVEL SECURITY;

-- 4. AUDIT LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FONCTION SECURITY DEFINER pour éviter récursion RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid AND role = 'admin' AND status = 'active'
  );
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles_select_all_auth" ON public.profiles;
CREATE POLICY "profiles_select_all_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles_update_admin_or_self_pwd" ON public.profiles;
CREATE POLICY "profiles_update_admin_or_self_pwd" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR id = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- rights_catalog (lecture seule pour authenticated)
DROP POLICY IF EXISTS "rights_catalog_select" ON public.rights_catalog;
CREATE POLICY "rights_catalog_select" ON public.rights_catalog
  FOR SELECT TO authenticated USING (true);

-- user_rights
DROP POLICY IF EXISTS "user_rights_select" ON public.user_rights;
CREATE POLICY "user_rights_select" ON public.user_rights
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_rights_modify_admin" ON public.user_rights;
CREATE POLICY "user_rights_modify_admin" ON public.user_rights
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- audit_log
DROP POLICY IF EXISTS "audit_log_insert_auth" ON public.audit_log;
CREATE POLICY "audit_log_insert_auth" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============================================================
-- TRIGGER : empêcher plus d'un admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_multiple_admins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE role = 'admin' AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Un seul administrateur est autorisé.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_multiple_admins ON public.profiles;
CREATE TRIGGER trg_prevent_multiple_admins
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_multiple_admins();

-- ============================================================
-- TRIGGER : à la création d'un profil non-admin, peupler user_rights à denied
-- ============================================================
CREATE OR REPLACE FUNCTION public.populate_user_rights_on_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role <> 'admin' THEN
    INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
    SELECT NEW.id, rc.tableau, rc.formulaire, rc.sous_formulaire, rc.champ_bouton, 'denied'
    FROM public.rights_catalog rc
    ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_user_rights ON public.profiles;
CREATE TRIGGER trg_populate_user_rights
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.populate_user_rights_on_new_profile();

-- Trigger updated_at sur user_rights
DROP TRIGGER IF EXISTS trg_user_rights_updated_at ON public.user_rights;
CREATE TRIGGER trg_user_rights_updated_at
  BEFORE UPDATE ON public.user_rights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============================================================
-- SEED : catalogue des 20 lignes de droits (ordre du brief)
-- ============================================================
INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton) VALUES
  (1,  'Tous', 'بطاقة متابعة إنجاز الطلبية', 'معلومات الطلب والزبون', 'Tous'),
  (2,  '',     '',                              'تحضير الطلبية والموارد', 'المواد الأولية'),
  (3,  '',     '',                              'تحضير الطلبية والموارد', 'العدة'),
  (4,  '',     '',                              'تحضير الطلبية والموارد', 'الدراسة'),
  (5,  '',     '',                              'مراحل الإنجاز والتوقيت', 'Tous'),
  (6,  '',     '',                              'مراقبة الجودة والتسليم', 'سجل مراقبة الجودة'),
  (7,  '',     '',                              '',                          'التسليم'),
  (8,  '',     '',                              '',                          'إلغاء الطلبية'),
  (9,  '',     '',                              '',                          'محو الطلبية'),
  (10, 'تسيير الطلبيات الجارية', '', 'تغيير ترتيب الطلبيات', ''),
  (11, 'جدول البرمجة', '',           'تغيير ترتيب الطلبيات في البرمجة', ''),
  (12, '',     'بداية / تبديل / نهاية الدوام', '', ''),
  (13, '',     '',                              '', 'ترتيب آلي'),
  (14, 'المستخدمون', 'إضافة / إزالة / تعليق مستخدم', '', ''),
  (15, 'العمال', '', '', ''),
  (16, 'الغيابات', '', '', ''),
  (17, 'العطل الرسمية', '', '', ''),
  (18, 'الزبائن', '', '', ''),
  (19, 'المناولون', '', '', ''),
  (20, 'العمليات', '', '', '')
ON CONFLICT (ordre) DO NOTHING;

-- ============================================================
-- SEED : profils des 2 utilisateurs existants
-- ============================================================
INSERT INTO public.profiles (id, display_name, role, status, force_password_change)
VALUES ('7b57bae3-4916-4b91-8e14-19a8d199cd31', 'منير', 'admin', 'active', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, role, status, force_password_change)
VALUES ('8eb70f73-d009-46bc-9e66-e527716d2931', 'سلاماني تصنيع', 'user', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- Forcer RW pour سلاماني تصنيع sur toutes les lignes (override du trigger qui aurait mis denied)
INSERT INTO public.user_rights (user_id, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces)
SELECT '8eb70f73-d009-46bc-9e66-e527716d2931', rc.tableau, rc.formulaire, rc.sous_formulaire, rc.champ_bouton, 'RW'
FROM public.rights_catalog rc
ON CONFLICT (user_id, tableau, formulaire, sous_formulaire, champ_bouton)
DO UPDATE SET niveau_acces = 'RW';
