-- ===================== DROITS =====================
INSERT INTO public.rights_catalog (ordre, tableau, formulaire, sous_formulaire, champ_bouton, libelle_fr, libelle_ar, is_confidential)
SELECT m.mx + v.n, v.t, '', '', '', v.fr, v.t, v.c
FROM (SELECT COALESCE(MAX(ordre),0) mx FROM public.rights_catalog) m,
(VALUES (1,'سندات الطلب','Bons de commande fournisseur',false),
        (2,'وصولات الاستلام','Bons de réception',false),
        (3,'وصولات التسليم','Bons de livraison',false),
        (4,'الفواتير','Factures',true),
        (5,'فواتير الاسترجاع','Factures d''avoir',true),
        (6,'التسديدات','Règlements',true),
        (7,'معلومات الشركة','Informations de l''entreprise',true)) v(n,t,fr,c)
WHERE NOT EXISTS (SELECT 1 FROM public.rights_catalog r WHERE r.tableau=v.t AND r.formulaire='' AND r.sous_formulaire='' AND r.champ_bouton='')
ORDER BY v.n;

-- ===================== HELPERS =====================
CREATE OR REPLACE FUNCTION public.doc_is_auto() RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT COALESCE(current_setting('app.doc_auto', true),'') = 'on' $$;

CREATE OR REPLACE FUNCTION public.forbid_delete() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN RAISE EXCEPTION 'Suppression interdite sur % : utilisez l''annulation (statut).', TG_TABLE_NAME; END; $$;

CREATE OR REPLACE FUNCTION public.can_read_commercial(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.can_read(_uid,'سندات الطلب','','','') OR public.can_read(_uid,'وصولات الاستلام','','','')
  OR public.can_read(_uid,'وصولات التسليم','','','') OR public.can_read(_uid,'الفواتير','','','')
  OR public.can_read(_uid,'فواتير الاسترجاع','','','') OR public.can_read(_uid,'التسديدات','','','')
  OR public.can_read(_uid,'معلومات الشركة','','','') $$;

-- ===================== A. SEQUENCES =====================
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('BC','BR','BL','FA','AV')),
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT document_sequences_type_year UNIQUE (doc_type, year)
);
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_document_number(_doc_type text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_year int := EXTRACT(YEAR FROM now())::int; v_n int;
BEGIN
  IF _doc_type NOT IN ('BC','BR','BL','FA','AV') THEN RAISE EXCEPTION 'Type de document inconnu : %', _doc_type; END IF;
  INSERT INTO public.document_sequences (doc_type, year, last_number) VALUES (_doc_type, v_year, 1)
  ON CONFLICT (doc_type, year) DO UPDATE SET last_number = public.document_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_n;
  RETURN _doc_type || '-' || v_year || '-' || lpad(v_n::text, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.doc_party_snapshot(_kind text, _id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _kind = 'client' THEN
    (SELECT jsonb_build_object('kind','client','id',c.id,'name',c.name,'activity',c.activity,'addresses',to_jsonb(c.addresses),
       'address_details',c.address_details,'phones',to_jsonb(c.phones),'emails',to_jsonb(c.emails),'representatives',c.representatives)
     FROM public.clients c WHERE c.id = _id)
  ELSE
    (SELECT jsonb_build_object('kind','supplier','id',s.id,'name',s.name,'address',s.address,'phone',s.phone,'email',s.email)
     FROM public.suppliers s WHERE s.id = _id)
  END $$;
REVOKE ALL ON FUNCTION public.doc_party_snapshot(text, uuid) FROM PUBLIC, anon, authenticated;

-- ===================== B. COMPANY SETTINGS =====================
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  legal_name_fr text, legal_name_ar text, address_fr text, address_ar text,
  phone text, email text,
  identifiers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(identifiers) = 'array'),
  bank_details text, legal_mentions_fr text, legal_mentions_ar text, footer_fr text, footer_ar text,
  logo_path text,
  default_currency text NOT NULL DEFAULT 'DZD',
  default_payment_days integer NOT NULL DEFAULT 30 CHECK (default_payment_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid()
);

-- ===================== C. TAX RATES =====================
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL, libelle_fr text NOT NULL, libelle_ar text,
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  kind text NOT NULL DEFAULT 'tva' CHECK (kind IN ('tva','timbre','autre')),
  is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_rates_code_unique_ci ON public.tax_rates (lower(btrim(code)));

-- ===================== D. PURCHASE ORDERS =====================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emis','recu_partiel','recu','annule')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  party_snapshot jsonb,
  order_date date NOT NULL DEFAULT CURRENT_DATE, expected_date date,
  currency text NOT NULL DEFAULT 'DZD', payment_terms text, notes text,
  subtotal_ht numeric(14,2) NOT NULL DEFAULT 0, total_tax numeric(14,2) NOT NULL DEFAULT 0, total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  issued_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT purchase_orders_cancel_chk CHECK (status <> 'annule' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('matiere','composant','frais')),
  grade_id uuid REFERENCES public.material_grades(id) ON DELETE RESTRICT,
  format_id uuid REFERENCES public.material_formats(id) ON DELETE RESTRICT,
  dimension_id uuid REFERENCES public.material_dimensions(id) ON DELETE RESTRICT,
  designation text NOT NULL, observation text,
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  estimated_weight_kg numeric(14,3) CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg >= 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  price_unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  price_quantity numeric(14,3) CHECK (price_quantity IS NULL OR price_quantity >= 0),
  tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE RESTRICT,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total_ht numeric(14,2) NOT NULL DEFAULT 0, line_tax numeric(14,2) NOT NULL DEFAULT 0, line_total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  source_order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  source_step_id uuid REFERENCES public.production_steps(id) ON DELETE RESTRICT,
  source_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT purchase_order_lines_no UNIQUE (purchase_order_id, line_no),
  CONSTRAINT purchase_order_lines_material_fk FOREIGN KEY (grade_id, format_id, dimension_id) REFERENCES public.materials (grade_id, format_id, dimension_id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_type_chk CHECK (
    (line_type = 'matiere' AND grade_id IS NOT NULL AND format_id IS NOT NULL AND dimension_id IS NOT NULL)
    OR (line_type <> 'matiere' AND grade_id IS NULL AND format_id IS NULL AND dimension_id IS NULL))
);

-- ===================== E. GOODS RECEIPTS =====================
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','valide','annule')),
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  party_snapshot jsonb,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_delivery_ref text, supplier_invoice_ref text, notes text,
  issued_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT goods_receipts_cancel_chk CHECK (status <> 'annule' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  purchase_order_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  line_type text NOT NULL CHECK (line_type IN ('matiere','composant','frais')),
  grade_id uuid REFERENCES public.material_grades(id) ON DELETE RESTRICT,
  format_id uuid REFERENCES public.material_formats(id) ON DELETE RESTRICT,
  dimension_id uuid REFERENCES public.material_dimensions(id) ON DELETE RESTRICT,
  designation text NOT NULL,
  quantity_received numeric(14,3) NOT NULL CHECK (quantity_received > 0),
  unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  received_weight_kg numeric(14,3) CHECK (received_weight_kg IS NULL OR received_weight_kg >= 0),
  invoiced_unit_price numeric(14,2) CHECK (invoiced_unit_price IS NULL OR invoiced_unit_price >= 0),
  price_unit_id uuid REFERENCES public.material_units(id) ON DELETE RESTRICT,
  price_quantity numeric(14,3) CHECK (price_quantity IS NULL OR price_quantity >= 0),
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  observation text,
  price_history_id uuid REFERENCES public.material_purchase_prices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT goods_receipt_lines_no UNIQUE (goods_receipt_id, line_no),
  CONSTRAINT goods_receipt_lines_material_fk FOREIGN KEY (grade_id, format_id, dimension_id) REFERENCES public.materials (grade_id, format_id, dimension_id) ON DELETE RESTRICT,
  CONSTRAINT goods_receipt_lines_type_chk CHECK (
    (line_type = 'matiere' AND grade_id IS NOT NULL AND format_id IS NOT NULL AND dimension_id IS NOT NULL)
    OR (line_type <> 'matiere' AND grade_id IS NULL AND format_id IS NULL AND dimension_id IS NULL))
);

-- ===================== F. DELIVERY NOTES =====================
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emis','livre','annule')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  party_snapshot jsonb, delivery_address_snapshot jsonb,
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  carrier_notes text, show_prices boolean NOT NULL DEFAULT false, notes text,
  issued_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT delivery_notes_cancel_chk CHECK (status <> 'annule' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.delivery_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_number text NOT NULL, designation text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit text,
  unit_price_ht numeric(14,2) CHECK (unit_price_ht IS NULL OR unit_price_ht >= 0),
  tax_rate_percent numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT delivery_note_lines_no UNIQUE (delivery_note_id, line_no)
);

-- ===================== G. INVOICES =====================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise','payee_partiel','payee','annulee')),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  party_snapshot jsonb,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE, due_date date,
  currency text NOT NULL DEFAULT 'DZD', payment_terms text, notes text,
  stamp_duty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (stamp_duty_amount >= 0),
  subtotal_ht numeric(14,2) NOT NULL DEFAULT 0, total_tax numeric(14,2) NOT NULL DEFAULT 0, total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  issued_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT invoices_cancel_chk CHECK (status <> 'annulee' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  delivery_note_line_id uuid REFERENCES public.delivery_note_lines(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  designation text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit text,
  unit_price_ht numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_ht >= 0),
  tax_rate_id uuid REFERENCES public.tax_rates(id) ON DELETE RESTRICT,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total_ht numeric(14,2) NOT NULL DEFAULT 0, line_tax numeric(14,2) NOT NULL DEFAULT 0, line_total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT invoice_lines_no UNIQUE (invoice_id, line_no)
);

-- ===================== H. CREDIT NOTES =====================
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emis','annule')),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  party_snapshot jsonb,
  credit_date date NOT NULL DEFAULT CURRENT_DATE,
  reason_category text NOT NULL CHECK (reason_category IN ('retour','erreur_prix','remise','autre')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  subtotal_ht numeric(14,2) NOT NULL DEFAULT 0, total_tax numeric(14,2) NOT NULL DEFAULT 0, total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  issued_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT credit_notes_cancel_chk CHECK (status <> 'annule' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines(id) ON DELETE RESTRICT,
  designation text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_ht numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price_ht >= 0),
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total_ht numeric(14,2) NOT NULL DEFAULT 0, line_tax numeric(14,2) NOT NULL DEFAULT 0, line_total_ttc numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT credit_note_lines_no UNIQUE (credit_note_id, line_no)
);

-- ===================== I. PAYMENTS =====================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('espece','cheque','virement','autre')),
  reference text, notes text,
  status text NOT NULL DEFAULT 'valide' CHECK (status IN ('valide','annule')),
  cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid(),
  CONSTRAINT payments_cancel_chk CHECK (status <> 'annule' OR (cancelled_at IS NOT NULL AND NULLIF(btrim(cancel_reason),'') IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid DEFAULT auth.uid()
);

-- ===================== INDEX =====================
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_number_unique_ci ON public.purchase_orders (lower(btrim(number))) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS goods_receipts_number_unique_ci ON public.goods_receipts (lower(btrim(number))) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_notes_number_unique_ci ON public.delivery_notes (lower(btrim(number))) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_unique_ci ON public.invoices (lower(btrim(number))) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_number_unique_ci ON public.credit_notes (lower(btrim(number))) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_date ON public.purchase_orders (order_date);
CREATE INDEX IF NOT EXISTS idx_pol_po ON public.purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pol_material ON public.purchase_order_lines (grade_id, format_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_pol_format ON public.purchase_order_lines (format_id);
CREATE INDEX IF NOT EXISTS idx_pol_dimension ON public.purchase_order_lines (dimension_id);
CREATE INDEX IF NOT EXISTS idx_pol_unit ON public.purchase_order_lines (unit_id);
CREATE INDEX IF NOT EXISTS idx_pol_price_unit ON public.purchase_order_lines (price_unit_id);
CREATE INDEX IF NOT EXISTS idx_pol_tax ON public.purchase_order_lines (tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_pol_source_order ON public.purchase_order_lines (source_order_id);
CREATE INDEX IF NOT EXISTS idx_pol_source_step ON public.purchase_order_lines (source_step_id);
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_supplier ON public.goods_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_gr_status ON public.goods_receipts (status);
CREATE INDEX IF NOT EXISTS idx_gr_date ON public.goods_receipts (received_date);
CREATE INDEX IF NOT EXISTS idx_grl_gr ON public.goods_receipt_lines (goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_grl_pol ON public.goods_receipt_lines (purchase_order_line_id);
CREATE INDEX IF NOT EXISTS idx_grl_material ON public.goods_receipt_lines (grade_id, format_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_grl_format ON public.goods_receipt_lines (format_id);
CREATE INDEX IF NOT EXISTS idx_grl_dimension ON public.goods_receipt_lines (dimension_id);
CREATE INDEX IF NOT EXISTS idx_grl_unit ON public.goods_receipt_lines (unit_id);
CREATE INDEX IF NOT EXISTS idx_grl_price_unit ON public.goods_receipt_lines (price_unit_id);
CREATE INDEX IF NOT EXISTS idx_grl_price_hist ON public.goods_receipt_lines (price_history_id);
CREATE INDEX IF NOT EXISTS idx_dn_client ON public.delivery_notes (client_id);
CREATE INDEX IF NOT EXISTS idx_dn_status ON public.delivery_notes (status);
CREATE INDEX IF NOT EXISTS idx_dn_date ON public.delivery_notes (delivery_date);
CREATE INDEX IF NOT EXISTS idx_dnl_dn ON public.delivery_note_lines (delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_dnl_order ON public.delivery_note_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_client ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_inv_date ON public.invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_inv_due ON public.invoices (due_date);
CREATE INDEX IF NOT EXISTS idx_invl_inv ON public.invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invl_dnl ON public.invoice_lines (delivery_note_line_id);
CREATE INDEX IF NOT EXISTS idx_invl_order ON public.invoice_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_invl_tax ON public.invoice_lines (tax_rate_id);
CREATE INDEX IF NOT EXISTS idx_cn_invoice ON public.credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_cn_client ON public.credit_notes (client_id);
CREATE INDEX IF NOT EXISTS idx_cn_status ON public.credit_notes (status);
CREATE INDEX IF NOT EXISTS idx_cn_date ON public.credit_notes (credit_date);
CREATE INDEX IF NOT EXISTS idx_cnl_cn ON public.credit_note_lines (credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cnl_invl ON public.credit_note_lines (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_pay_client ON public.payments (client_id);
CREATE INDEX IF NOT EXISTS idx_pay_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_pay_date ON public.payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON public.payment_allocations (invoice_id);

-- ===================== GUARD GENERIQUE EN-TETE =====================
-- TG_ARGV : 0 doc_type, 1 statut brouillon, 2 statut émis, 3 statut annulé, 4 'client'|'supplier', 5 table lignes, 6 FK lignes, 7 statuts post-émission autorisés (csv)
CREATE OR REPLACE FUNCTION public.doc_header_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_doc text := TG_ARGV[0]; v_draft text := TG_ARGV[1]; v_issued text := TG_ARGV[2]; v_cancel text := TG_ARGV[3];
  v_party text := TG_ARGV[4]; v_lt text := TG_ARGV[5]; v_lfk text := TG_ARGV[6];
  v_extra text[] := string_to_array(COALESCE(TG_ARGV[7],''), ',');
  v_keep text[] := ARRAY['number','subtotal_ht','total_tax','total_ttc','amount_paid','issued_at','party_snapshot'];
  v_allowed text[] := ARRAY['status','cancelled_at','cancel_reason','updated_at'];
  o jsonb; n jsonb; k text; v_has boolean; v_pid uuid;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  n := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM v_draft THEN
      RAISE EXCEPTION 'Un document % doit être créé à l''état "%".', TG_TABLE_NAME, v_draft;
    END IF;
    FOREACH k IN ARRAY v_keep LOOP
      IF n ? k THEN
        n := jsonb_set(n, ARRAY[k], CASE WHEN k IN ('subtotal_ht','total_tax','total_ttc','amount_paid') THEN '0'::jsonb ELSE 'null'::jsonb END);
      END IF;
    END LOOP;
    IF n ? 'stamp_duty_amount' THEN
      n := jsonb_set(n, '{total_ttc}', to_jsonb(COALESCE((n->>'stamp_duty_amount')::numeric, 0)));
    END IF;
    NEW := jsonb_populate_record(NEW, n);
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  FOREACH k IN ARRAY v_keep LOOP
    IF n ? k THEN n := jsonb_set(n, ARRAY[k], o->k); END IF;
  END LOOP;

  IF OLD.status = v_draft THEN
    IF n ? 'stamp_duty_amount' THEN
      n := jsonb_set(n, '{total_ttc}', to_jsonb((n->>'subtotal_ht')::numeric + (n->>'total_tax')::numeric + COALESCE((n->>'stamp_duty_amount')::numeric,0)));
    END IF;
    IF NEW.status = v_draft THEN
      NULL;
    ELSIF NEW.status = v_issued THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1)', v_lt, v_lfk) INTO v_has USING OLD.id;
      IF NOT v_has THEN RAISE EXCEPTION 'Impossible d''émettre un document sans ligne.'; END IF;
      n := jsonb_set(n, '{number}', to_jsonb(public.next_document_number(v_doc)));
      n := jsonb_set(n, '{issued_at}', to_jsonb(now()));
      v_pid := (n->>(v_party || '_id'))::uuid;
      n := jsonb_set(n, '{party_snapshot}', COALESCE(public.doc_party_snapshot(v_party, v_pid), 'null'::jsonb));
      IF n ? 'delivery_address_snapshot' AND jsonb_typeof(n->'delivery_address_snapshot') IS DISTINCT FROM 'object' THEN
        n := jsonb_set(n, '{delivery_address_snapshot}', COALESCE((
          SELECT jsonb_build_object('address', c.addresses[1], 'details', c.address_details->0) FROM public.clients c WHERE c.id = v_pid), 'null'::jsonb));
      END IF;
    ELSIF NEW.status = v_cancel THEN
      IF NEW.cancelled_at IS NULL THEN n := jsonb_set(n, '{cancelled_at}', to_jsonb(now())); END IF;
    ELSE
      RAISE EXCEPTION 'Transition de statut non autorisée : % -> %.', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status = v_cancel THEN
    RAISE EXCEPTION 'Document annulé : aucune modification possible.';
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> v_cancel AND NOT (NEW.status = ANY (v_extra)) THEN
      RAISE EXCEPTION 'Transition de statut non autorisée : % -> %.', OLD.status, NEW.status;
    END IF;
    IF NEW.status = v_cancel AND NEW.cancelled_at IS NULL THEN n := jsonb_set(n, '{cancelled_at}', to_jsonb(now())); END IF;
    IF (n - v_allowed) IS DISTINCT FROM (o - v_allowed) THEN
      RAISE EXCEPTION 'Document émis (%) : seule l''annulation est permise.', COALESCE(OLD.number::text, '');
    END IF;
  END IF;
  NEW := jsonb_populate_record(NEW, n);
  RETURN NEW;
END; $$;

-- ===================== GUARD GENERIQUE LIGNES =====================
-- TG_ARGV : 0 table en-tête, 1 FK, 2 statut brouillon
CREATE OR REPLACE FUNCTION public.doc_line_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_st text; v_id uuid;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  v_id := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
  IF TG_OP = 'UPDATE' AND v_id IS DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[1])::uuid THEN
    RAISE EXCEPTION 'Une ligne ne peut pas changer de document.';
  END IF;
  EXECUTE format('SELECT status FROM public.%I WHERE id = $1 FOR UPDATE', TG_ARGV[0]) INTO v_st USING v_id;
  IF v_st IS DISTINCT FROM TG_ARGV[2] THEN
    RAISE EXCEPTION 'Document non brouillon (%) : lignes non modifiables.', v_st;
  END IF;
  RETURN NEW;
END; $$;

-- ===================== RECALCUL GENERIQUE DES TOTAUX =====================
-- TG_ARGV : 0 table en-tête, 1 FK, 2 'stamp' si droit de timbre
CREATE OR REPLACE FUNCTION public.doc_recompute_totals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid := (to_jsonb(NEW)->>TG_ARGV[1])::uuid; v_prev text := COALESCE(current_setting('app.doc_auto', true),'');
BEGIN
  PERFORM set_config('app.doc_auto','on',true);
  EXECUTE format('UPDATE public.%1$I h SET subtotal_ht = s.ht, total_tax = s.tx, total_ttc = s.ht + s.tx%3$s
                  FROM (SELECT COALESCE(SUM(line_total_ht),0) ht, COALESCE(SUM(line_tax),0) tx FROM public.%2$I WHERE %4$I = $1) s
                  WHERE h.id = $1',
                 TG_ARGV[0], TG_TABLE_NAME, CASE WHEN TG_ARGV[2] = 'stamp' THEN ' + COALESCE(h.stamp_duty_amount,0)' ELSE '' END, TG_ARGV[1])
  USING v_id;
  PERFORM set_config('app.doc_auto', v_prev, true);
  RETURN NULL;
END; $$;

-- ===================== D. PO : calcul de ligne, annulation =====================
CREATE OR REPLACE FUNCTION public.po_line_compute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.line_type = 'matiere' AND NULLIF(btrim(NEW.designation),'') IS NULL THEN
    SELECT concat_ws(' ', g.libelle_fr, f.libelle_fr, d.libelle) INTO NEW.designation
    FROM public.material_grades g, public.material_formats f, public.material_dimensions d
    WHERE g.id = NEW.grade_id AND f.id = NEW.format_id AND d.id = NEW.dimension_id;
  END IF;
  IF NEW.tax_rate_id IS NOT NULL THEN
    SELECT rate_percent INTO NEW.tax_rate_percent FROM public.tax_rates WHERE id = NEW.tax_rate_id;
  END IF;
  NEW.tax_rate_percent := COALESCE(NEW.tax_rate_percent, 0);
  NEW.line_total_ht := ROUND(COALESCE(NEW.price_quantity, NEW.quantity) * COALESCE(NEW.unit_price, 0), 2);
  NEW.line_tax := ROUND(NEW.line_total_ht * NEW.tax_rate_percent / 100, 2);
  NEW.line_total_ttc := NEW.line_total_ht + NEW.line_tax;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.po_header_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.status = 'annule' AND OLD.status <> 'annule'
     AND EXISTS (SELECT 1 FROM public.goods_receipts WHERE purchase_order_id = NEW.id AND status <> 'annule') THEN
    RAISE EXCEPTION 'Impossible d''annuler : des bons de réception non annulés sont liés à ce bon de commande.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.po_refresh_status(_po uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_st text; v_all boolean; v_any boolean; v_gr boolean; v_new text; v_prev text := COALESCE(current_setting('app.doc_auto', true),'');
BEGIN
  IF _po IS NULL THEN RETURN; END IF;
  SELECT status INTO v_st FROM public.purchase_orders WHERE id = _po FOR UPDATE;
  IF v_st NOT IN ('emis','recu_partiel','recu') THEN RETURN; END IF;
  SELECT bool_and(rec >= qty), bool_or(rec > 0) INTO v_all, v_any FROM (
    SELECT pol.quantity qty, COALESCE(SUM(grl.quantity_received) FILTER (WHERE gr.status = 'valide'), 0) rec
    FROM public.purchase_order_lines pol
    LEFT JOIN public.goods_receipt_lines grl ON grl.purchase_order_line_id = pol.id
    LEFT JOIN public.goods_receipts gr ON gr.id = grl.goods_receipt_id
    WHERE pol.purchase_order_id = _po AND pol.line_type <> 'frais'
    GROUP BY pol.id, pol.quantity) x;
  v_gr := EXISTS (SELECT 1 FROM public.goods_receipts WHERE purchase_order_id = _po AND status = 'valide');
  v_new := CASE WHEN COALESCE(v_all, v_gr) AND v_gr THEN 'recu' WHEN COALESCE(v_any,false) OR v_gr THEN 'recu_partiel' ELSE 'emis' END;
  IF v_new <> v_st THEN
    PERFORM set_config('app.doc_auto','on',true);
    UPDATE public.purchase_orders SET status = v_new WHERE id = _po;
    PERFORM set_config('app.doc_auto', v_prev, true);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.po_refresh_status(uuid) FROM PUBLIC, anon, authenticated;

-- ===================== E. GR : contrôles, calcul, statut du BC =====================
CREATE OR REPLACE FUNCTION public.gr_header_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_st text; v_sup uuid;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     AND EXISTS (SELECT 1 FROM public.goods_receipt_lines WHERE goods_receipt_id = NEW.id AND purchase_order_line_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Bon de commande non modifiable : des lignes y sont déjà rattachées.';
  END IF;
  IF NEW.purchase_order_id IS NOT NULL AND NEW.status IN ('brouillon','valide') THEN
    SELECT status, supplier_id INTO v_st, v_sup FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    IF NEW.supplier_id IS NULL THEN NEW.supplier_id := v_sup; END IF;
    IF NEW.supplier_id <> v_sup THEN RAISE EXCEPTION 'Le fournisseur du bon de réception diffère de celui du bon de commande.'; END IF;
    IF v_st NOT IN ('emis','recu_partiel','recu') THEN RAISE EXCEPTION 'Le bon de commande lié doit être émis (statut actuel : %).', v_st; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.gr_line_compute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.purchase_order_lines%ROWTYPE;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.purchase_order_line_id IS NOT NULL THEN
    SELECT pol.* INTO r FROM public.purchase_order_lines pol
    JOIN public.goods_receipts gr ON gr.id = NEW.goods_receipt_id
    WHERE pol.id = NEW.purchase_order_line_id AND pol.purchase_order_id = gr.purchase_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La ligne de commande n''appartient pas au bon de commande du bon de réception.'; END IF;
    NEW.line_type := COALESCE(NEW.line_type, r.line_type);
    IF NEW.line_type = 'matiere' THEN
      NEW.grade_id := COALESCE(NEW.grade_id, r.grade_id); NEW.format_id := COALESCE(NEW.format_id, r.format_id); NEW.dimension_id := COALESCE(NEW.dimension_id, r.dimension_id);
    END IF;
    NEW.designation := COALESCE(NULLIF(btrim(NEW.designation),''), r.designation);
    NEW.unit_id := COALESCE(NEW.unit_id, r.unit_id);
    NEW.price_unit_id := COALESCE(NEW.price_unit_id, r.price_unit_id);
    NEW.invoiced_unit_price := COALESCE(NEW.invoiced_unit_price, r.unit_price);
  END IF;
  IF NEW.line_type = 'matiere' AND NULLIF(btrim(NEW.designation),'') IS NULL THEN
    SELECT concat_ws(' ', g.libelle_fr, f.libelle_fr, d.libelle) INTO NEW.designation
    FROM public.material_grades g, public.material_formats f, public.material_dimensions d
    WHERE g.id = NEW.grade_id AND f.id = NEW.format_id AND d.id = NEW.dimension_id;
  END IF;
  NEW.line_total := ROUND(COALESCE(NEW.price_quantity, NEW.quantity_received) * COALESCE(NEW.invoiced_unit_price, 0), 2);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.gr_after_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM public.po_refresh_status(NEW.purchase_order_id); END IF;
  RETURN NULL;
END; $$;

-- ===================== F. BL : contrôles =====================
CREATE OR REPLACE FUNCTION public.dn_header_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.status = 'annule' AND OLD.status <> 'annule' AND EXISTS (
     SELECT 1 FROM public.invoice_lines il JOIN public.invoices i ON i.id = il.invoice_id
     JOIN public.delivery_note_lines dl ON dl.id = il.delivery_note_line_id
     WHERE dl.delivery_note_id = NEW.id AND i.status <> 'annulee') THEN
    RAISE EXCEPTION 'Impossible d''annuler : ce bon de livraison est repris sur une facture non annulée.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id AND EXISTS (SELECT 1 FROM public.delivery_note_lines WHERE delivery_note_id = NEW.id) THEN
    RAISE EXCEPTION 'Client non modifiable : le bon de livraison contient déjà des lignes.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.dn_line_compute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders%ROWTYPE; v_client uuid; v_sum numeric;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  SELECT client_id INTO v_client FROM public.delivery_notes WHERE id = NEW.delivery_note_id;
  IF o.client_id IS NOT NULL AND o.client_id <> v_client THEN
    RAISE EXCEPTION 'La commande % appartient à un autre client que celui du bon de livraison.', o.order_number;
  END IF;
  NEW.order_number := COALESCE(NULLIF(btrim(NEW.order_number),''), o.order_number);
  NEW.designation := COALESCE(NULLIF(btrim(NEW.designation),''), o.designation);
  PERFORM pg_advisory_xact_lock(hashtext('dn_order:' || NEW.order_id::text));
  SELECT COALESCE(SUM(dl.quantity),0) INTO v_sum FROM public.delivery_note_lines dl
  JOIN public.delivery_notes dn ON dn.id = dl.delivery_note_id
  WHERE dl.order_id = NEW.order_id AND dn.status <> 'annule' AND dl.id <> NEW.id;
  IF v_sum + NEW.quantity > o.quantity THEN
    RAISE EXCEPTION 'Quantité livrée (%) supérieure à la quantité de la commande % (%).', v_sum + NEW.quantity, o.order_number, o.quantity;
  END IF;
  RETURN NEW;
END; $$;

-- ===================== G. FACTURES =====================
CREATE OR REPLACE FUNCTION public.invoice_header_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.status = 'annulee' AND OLD.status <> 'annulee' THEN
    IF EXISTS (SELECT 1 FROM public.payment_allocations pa JOIN public.payments p ON p.id = pa.payment_id WHERE pa.invoice_id = NEW.id AND p.status = 'valide') THEN
      RAISE EXCEPTION 'Impossible d''annuler : des règlements valides sont affectés à cette facture.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.credit_notes WHERE invoice_id = NEW.id AND status <> 'annule') THEN
      RAISE EXCEPTION 'Impossible d''annuler : des factures d''avoir non annulées existent sur cette facture.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id AND EXISTS (SELECT 1 FROM public.invoice_lines WHERE invoice_id = NEW.id AND delivery_note_line_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Client non modifiable : la facture reprend déjà des lignes de bon de livraison.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_line_compute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE dl public.delivery_note_lines%ROWTYPE; v_dn_st text; v_dn_client uuid; v_client uuid; v_sum numeric;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF NEW.delivery_note_line_id IS NOT NULL THEN
    SELECT * INTO dl FROM public.delivery_note_lines WHERE id = NEW.delivery_note_line_id;
    SELECT status, client_id INTO v_dn_st, v_dn_client FROM public.delivery_notes WHERE id = dl.delivery_note_id;
    SELECT client_id INTO v_client FROM public.invoices WHERE id = NEW.invoice_id;
    IF v_dn_st NOT IN ('emis','livre') THEN RAISE EXCEPTION 'Le bon de livraison doit être émis pour être facturé (statut : %).', v_dn_st; END IF;
    IF v_dn_client <> v_client THEN RAISE EXCEPTION 'Le bon de livraison appartient à un autre client.'; END IF;
    NEW.order_id := COALESCE(NEW.order_id, dl.order_id);
    NEW.designation := COALESCE(NULLIF(btrim(NEW.designation),''), dl.designation);
    NEW.unit := COALESCE(NEW.unit, dl.unit);
    IF NEW.tax_rate_id IS NULL AND NEW.tax_rate_percent IS NULL THEN NEW.tax_rate_percent := dl.tax_rate_percent; END IF;
    IF NEW.unit_price_ht IS NULL THEN NEW.unit_price_ht := dl.unit_price_ht; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('inv_dnl:' || dl.id::text));
    SELECT COALESCE(SUM(il.quantity),0) INTO v_sum FROM public.invoice_lines il JOIN public.invoices i ON i.id = il.invoice_id
    WHERE il.delivery_note_line_id = dl.id AND i.status <> 'annulee' AND il.id <> NEW.id;
    IF v_sum + NEW.quantity > dl.quantity THEN
      RAISE EXCEPTION 'Quantité facturée (%) supérieure à la quantité livrée (%).', v_sum + NEW.quantity, dl.quantity;
    END IF;
  END IF;
  IF NEW.tax_rate_id IS NOT NULL THEN SELECT rate_percent INTO NEW.tax_rate_percent FROM public.tax_rates WHERE id = NEW.tax_rate_id; END IF;
  NEW.tax_rate_percent := COALESCE(NEW.tax_rate_percent, 0);
  NEW.unit_price_ht := COALESCE(NEW.unit_price_ht, 0);
  NEW.line_total_ht := ROUND(NEW.quantity * NEW.unit_price_ht, 2);
  NEW.line_tax := ROUND(NEW.line_total_ht * NEW.tax_rate_percent / 100, 2);
  NEW.line_total_ttc := NEW.line_total_ht + NEW.line_tax;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.invoice_refresh_payment(_inv uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i public.invoices%ROWTYPE; v_paid numeric; v_cred numeric; v_net numeric; v_st text; v_prev text := COALESCE(current_setting('app.doc_auto', true),'');
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _inv FOR UPDATE;
  IF NOT FOUND OR i.status IN ('brouillon','annulee') THEN RETURN; END IF;
  SELECT COALESCE(SUM(pa.amount),0) INTO v_paid FROM public.payment_allocations pa JOIN public.payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = _inv AND p.status = 'valide';
  SELECT COALESCE(SUM(total_ttc),0) INTO v_cred FROM public.credit_notes WHERE invoice_id = _inv AND status = 'emis';
  v_net := i.total_ttc - v_cred;
  IF v_paid > v_net THEN
    RAISE EXCEPTION 'Le montant réglé (%) dépasserait le net à payer de la facture (%).', v_paid, v_net;
  END IF;
  v_st := CASE WHEN v_paid > 0 AND v_paid >= v_net THEN 'payee' WHEN v_paid > 0 THEN 'payee_partiel' ELSE 'emise' END;
  IF v_st IS DISTINCT FROM i.status OR v_paid IS DISTINCT FROM i.amount_paid THEN
    PERFORM set_config('app.doc_auto','on',true);
    UPDATE public.invoices SET amount_paid = v_paid, status = v_st WHERE id = _inv;
    PERFORM set_config('app.doc_auto', v_prev, true);
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.invoice_refresh_payment(uuid) FROM PUBLIC, anon, authenticated;

-- ===================== H. AVOIRS =====================
CREATE OR REPLACE FUNCTION public.cn_header_checks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_st text; v_client uuid;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN RAISE EXCEPTION 'La facture d''origine d''un avoir n''est pas modifiable.'; END IF;
  SELECT status, client_id INTO v_st, v_client FROM public.invoices WHERE id = NEW.invoice_id;
  IF NEW.client_id IS NULL THEN NEW.client_id := v_client; END IF;
  IF NEW.client_id <> v_client THEN RAISE EXCEPTION 'Le client de l''avoir doit être celui de la facture.'; END IF;
  IF (TG_OP = 'INSERT' OR (NEW.status = 'emis' AND OLD.status = 'brouillon')) AND v_st NOT IN ('emise','payee_partiel','payee') THEN
    RAISE EXCEPTION 'Un avoir n''est possible que sur une facture émise (statut : %).', v_st;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.cn_line_compute() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE il public.invoice_lines%ROWTYPE; v_inv uuid; v_sum numeric;
BEGIN
  IF public.doc_is_auto() THEN RETURN NEW; END IF;
  SELECT invoice_id INTO v_inv FROM public.credit_notes WHERE id = NEW.credit_note_id;
  SELECT * INTO il FROM public.invoice_lines WHERE id = NEW.invoice_line_id;
  IF il.invoice_id IS DISTINCT FROM v_inv THEN RAISE EXCEPTION 'La ligne de facture n''appartient pas à la facture de l''avoir.'; END IF;
  NEW.designation := COALESCE(NULLIF(btrim(NEW.designation),''), il.designation);
  IF TG_OP = 'INSERT' THEN
    NEW.unit_price_ht := COALESCE(NULLIF(NEW.unit_price_ht, 0), il.unit_price_ht);
    NEW.tax_rate_percent := COALESCE(NULLIF(NEW.tax_rate_percent, 0), il.tax_rate_percent);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cn_invl:' || il.id::text));
  SELECT COALESCE(SUM(cl.quantity),0) INTO v_sum FROM public.credit_note_lines cl JOIN public.credit_notes c ON c.id = cl.credit_note_id
  WHERE cl.invoice_line_id = il.id AND c.status <> 'annule' AND cl.id <> NEW.id;
  IF v_sum + NEW.quantity > il.quantity THEN
    RAISE EXCEPTION 'Quantité créditée (%) supérieure à la quantité facturée (%).', v_sum + NEW.quantity, il.quantity;
  END IF;
  NEW.line_total_ht := ROUND(NEW.quantity * NEW.unit_price_ht, 2);
  NEW.line_tax := ROUND(NEW.line_total_ht * NEW.tax_rate_percent / 100, 2);
  NEW.line_total_ttc := NEW.line_total_ht + NEW.line_tax;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.cn_after_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM public.invoice_refresh_payment(NEW.invoice_id); END IF;
  RETURN NULL;
END; $$;

-- ===================== I. REGLEMENTS =====================
CREATE OR REPLACE FUNCTION public.payment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_allowed text[] := ARRAY['status','cancelled_at','cancel_reason','updated_at','notes'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'valide' THEN RAISE EXCEPTION 'Un règlement doit être créé à l''état "valide".'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'annule' THEN RAISE EXCEPTION 'Règlement annulé : aucune modification possible.'; END IF;
  IF NEW.status = 'annule' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  IF (to_jsonb(NEW) - v_allowed) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed) THEN
    RAISE EXCEPTION 'Règlement : seule l''annulation (ou les notes) peut être modifiée.';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.payment_after_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    FOR r IN SELECT DISTINCT invoice_id FROM public.payment_allocations WHERE payment_id = NEW.id LOOP
      PERFORM public.invoice_refresh_payment(r.invoice_id);
    END LOOP;
  END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.allocation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.payments%ROWTYPE; i public.invoices%ROWTYPE; v_pay_sum numeric; v_inv_sum numeric; v_cred numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Une affectation de règlement n''est pas modifiable : annulez le règlement.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pay:' || NEW.payment_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('inv:' || NEW.invoice_id::text));
  SELECT * INTO p FROM public.payments WHERE id = NEW.payment_id;
  SELECT * INTO i FROM public.invoices WHERE id = NEW.invoice_id;
  IF p.status <> 'valide' THEN RAISE EXCEPTION 'Règlement annulé : affectation impossible.'; END IF;
  IF i.status NOT IN ('emise','payee_partiel') THEN RAISE EXCEPTION 'La facture doit être émise et non soldée (statut : %).', i.status; END IF;
  IF p.client_id <> i.client_id THEN RAISE EXCEPTION 'Le règlement et la facture concernent des clients différents.'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_pay_sum FROM public.payment_allocations WHERE payment_id = NEW.payment_id;
  IF v_pay_sum + NEW.amount > p.amount THEN
    RAISE EXCEPTION 'Affectations (%) supérieures au montant du règlement (%).', v_pay_sum + NEW.amount, p.amount;
  END IF;
  SELECT COALESCE(SUM(pa.amount),0) INTO v_inv_sum FROM public.payment_allocations pa JOIN public.payments pp ON pp.id = pa.payment_id
  WHERE pa.invoice_id = NEW.invoice_id AND pp.status = 'valide';
  SELECT COALESCE(SUM(total_ttc),0) INTO v_cred FROM public.credit_notes WHERE invoice_id = NEW.invoice_id AND status = 'emis';
  IF v_inv_sum + NEW.amount > i.total_ttc - v_cred THEN
    RAISE EXCEPTION 'Affectations (%) supérieures au net à payer de la facture (%).', v_inv_sum + NEW.amount, i.total_ttc - v_cred;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.allocation_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.invoice_refresh_payment(NEW.invoice_id); RETURN NULL; END; $$;

-- ===================== TRIGGERS =====================
-- updated_at + interdiction de suppression sur toutes les tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_sequences','company_settings','tax_rates','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines',
    'delivery_notes','delivery_note_lines','invoices','invoice_lines','credit_notes','credit_note_lines','payments','payment_allocations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_z_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_z_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_no_delete ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_no_delete BEFORE DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.forbid_delete()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_a_guard ON public.purchase_orders;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW
  EXECUTE FUNCTION public.doc_header_guard('BC','brouillon','emis','annule','supplier','purchase_order_lines','purchase_order_id','');
DROP TRIGGER IF EXISTS trg_b_checks ON public.purchase_orders;
CREATE TRIGGER trg_b_checks BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.po_header_checks();
DROP TRIGGER IF EXISTS trg_a_guard ON public.purchase_order_lines;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.purchase_order_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_line_guard('purchase_orders','purchase_order_id','brouillon');
DROP TRIGGER IF EXISTS trg_b_compute ON public.purchase_order_lines;
CREATE TRIGGER trg_b_compute BEFORE INSERT OR UPDATE ON public.purchase_order_lines FOR EACH ROW EXECUTE FUNCTION public.po_line_compute();
DROP TRIGGER IF EXISTS trg_c_totals ON public.purchase_order_lines;
CREATE TRIGGER trg_c_totals AFTER INSERT OR UPDATE ON public.purchase_order_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_recompute_totals('purchase_orders','purchase_order_id','');

DROP TRIGGER IF EXISTS trg_a_guard ON public.goods_receipts;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW
  EXECUTE FUNCTION public.doc_header_guard('BR','brouillon','valide','annule','supplier','goods_receipt_lines','goods_receipt_id','');
DROP TRIGGER IF EXISTS trg_b_checks ON public.goods_receipts;
CREATE TRIGGER trg_b_checks BEFORE INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.gr_header_checks();
DROP TRIGGER IF EXISTS trg_c_po_status ON public.goods_receipts;
CREATE TRIGGER trg_c_po_status AFTER UPDATE OF status ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.gr_after_status();
DROP TRIGGER IF EXISTS trg_a_guard ON public.goods_receipt_lines;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.goods_receipt_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_line_guard('goods_receipts','goods_receipt_id','brouillon');
DROP TRIGGER IF EXISTS trg_b_compute ON public.goods_receipt_lines;
CREATE TRIGGER trg_b_compute BEFORE INSERT OR UPDATE ON public.goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.gr_line_compute();

DROP TRIGGER IF EXISTS trg_a_guard ON public.delivery_notes;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.delivery_notes FOR EACH ROW
  EXECUTE FUNCTION public.doc_header_guard('BL','brouillon','emis','annule','client','delivery_note_lines','delivery_note_id','livre');
DROP TRIGGER IF EXISTS trg_b_checks ON public.delivery_notes;
CREATE TRIGGER trg_b_checks BEFORE UPDATE ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.dn_header_checks();
DROP TRIGGER IF EXISTS trg_a_guard ON public.delivery_note_lines;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.delivery_note_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_line_guard('delivery_notes','delivery_note_id','brouillon');
DROP TRIGGER IF EXISTS trg_b_compute ON public.delivery_note_lines;
CREATE TRIGGER trg_b_compute BEFORE INSERT OR UPDATE ON public.delivery_note_lines FOR EACH ROW EXECUTE FUNCTION public.dn_line_compute();

DROP TRIGGER IF EXISTS trg_a_guard ON public.invoices;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW
  EXECUTE FUNCTION public.doc_header_guard('FA','brouillon','emise','annulee','client','invoice_lines','invoice_id','');
DROP TRIGGER IF EXISTS trg_b_checks ON public.invoices;
CREATE TRIGGER trg_b_checks BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_header_checks();
DROP TRIGGER IF EXISTS trg_a_guard ON public.invoice_lines;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.invoice_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_line_guard('invoices','invoice_id','brouillon');
DROP TRIGGER IF EXISTS trg_b_compute ON public.invoice_lines;
CREATE TRIGGER trg_b_compute BEFORE INSERT OR UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.invoice_line_compute();
DROP TRIGGER IF EXISTS trg_c_totals ON public.invoice_lines;
CREATE TRIGGER trg_c_totals AFTER INSERT OR UPDATE ON public.invoice_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_recompute_totals('invoices','invoice_id','stamp');

DROP TRIGGER IF EXISTS trg_a_guard ON public.credit_notes;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.credit_notes FOR EACH ROW
  EXECUTE FUNCTION public.doc_header_guard('AV','brouillon','emis','annule','client','credit_note_lines','credit_note_id','');
DROP TRIGGER IF EXISTS trg_b_checks ON public.credit_notes;
CREATE TRIGGER trg_b_checks BEFORE INSERT OR UPDATE ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.cn_header_checks();
DROP TRIGGER IF EXISTS trg_c_invoice ON public.credit_notes;
CREATE TRIGGER trg_c_invoice AFTER UPDATE OF status ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.cn_after_status();
DROP TRIGGER IF EXISTS trg_a_guard ON public.credit_note_lines;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.credit_note_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_line_guard('credit_notes','credit_note_id','brouillon');
DROP TRIGGER IF EXISTS trg_b_compute ON public.credit_note_lines;
CREATE TRIGGER trg_b_compute BEFORE INSERT OR UPDATE ON public.credit_note_lines FOR EACH ROW EXECUTE FUNCTION public.cn_line_compute();
DROP TRIGGER IF EXISTS trg_c_totals ON public.credit_note_lines;
CREATE TRIGGER trg_c_totals AFTER INSERT OR UPDATE ON public.credit_note_lines FOR EACH ROW
  EXECUTE FUNCTION public.doc_recompute_totals('credit_notes','credit_note_id','');

DROP TRIGGER IF EXISTS trg_a_guard ON public.payments;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_guard();
DROP TRIGGER IF EXISTS trg_c_invoices ON public.payments;
CREATE TRIGGER trg_c_invoices AFTER UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_after_status();
DROP TRIGGER IF EXISTS trg_a_guard ON public.payment_allocations;
CREATE TRIGGER trg_a_guard BEFORE INSERT OR UPDATE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.allocation_guard();
DROP TRIGGER IF EXISTS trg_c_invoice ON public.payment_allocations;
CREATE TRIGGER trg_c_invoice AFTER INSERT ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.allocation_after();

-- ===================== GRANTS + RLS =====================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('purchase_orders','سندات الطلب'),('purchase_order_lines','سندات الطلب'),
    ('goods_receipts','وصولات الاستلام'),('goods_receipt_lines','وصولات الاستلام'),
    ('delivery_notes','وصولات التسليم'),('delivery_note_lines','وصولات التسليم'),
    ('invoices','الفواتير'),('invoice_lines','الفواتير'),
    ('credit_notes','فواتير الاسترجاع'),('credit_note_lines','فواتير الاسترجاع'),
    ('payments','التسديدات'),('payment_allocations','التسديدات')) v(t, d) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', r.t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t || '_select', r.t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_read(auth.uid(), %L, '''', '''', ''''))', r.t || '_select', r.t, r.d);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t || '_insert', r.t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), %L, '''', '''', ''''))', r.t || '_insert', r.t, r.d);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.t || '_update', r.t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write(auth.uid(), %L, '''', '''', '''')) WITH CHECK (public.can_write(auth.uid(), %L, '''', '''', ''''))', r.t || '_update', r.t, r.d, r.d);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_settings_select ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated USING (public.can_read_commercial(auth.uid()));
DROP POLICY IF EXISTS company_settings_insert ON public.company_settings;
CREATE POLICY company_settings_insert ON public.company_settings FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), 'معلومات الشركة', '', '', ''));
DROP POLICY IF EXISTS company_settings_update ON public.company_settings;
CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE TO authenticated
  USING (public.can_write(auth.uid(), 'معلومات الشركة', '', '', '')) WITH CHECK (public.can_write(auth.uid(), 'معلومات الشركة', '', '', ''));

GRANT SELECT, INSERT, UPDATE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_rates_select ON public.tax_rates;
CREATE POLICY tax_rates_select ON public.tax_rates FOR SELECT TO authenticated USING (public.can_read_commercial(auth.uid()));
DROP POLICY IF EXISTS tax_rates_insert ON public.tax_rates;
CREATE POLICY tax_rates_insert ON public.tax_rates FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid(), 'معلومات الشركة', '', '', ''));
DROP POLICY IF EXISTS tax_rates_update ON public.tax_rates;
CREATE POLICY tax_rates_update ON public.tax_rates FOR UPDATE TO authenticated
  USING (public.can_write(auth.uid(), 'معلومات الشركة', '', '', '')) WITH CHECK (public.can_write(auth.uid(), 'معلومات الشركة', '', '', ''));