# 04 — Modèle de données

46 tables dans le schéma `public`, 2 vues, 1 séquence applicative. Conventions : `snake_case` en base, `camelCase` côté frontend (mapping dans `src/lib/supabase-data.ts`), identifiants UUID (`crypto.randomUUID()`), dates ISO en base / `dd/mm/yyyy` à l'affichage. Toutes les tables ont RLS activé. Le détail exhaustif (608 colonnes, 196 contraintes, 142 index, 138 policies) figure dans l'audit `db_audit_2026-11-02.zip` (dossier Files) ; ci-dessous le rôle de chaque table.

## Cœur production

| Table | Rôle | Points clés |
|---|---|---|
| `orders` | Commandes clients | `order_number` unique (trigger `prevent_duplicate_order_number`), `order_date`, `client_id` → clients, `designation`, `quantity`, `priority` (P1–P4), `display_order`/`manual_sort_order` (ordre C_n), `frozen_order`, délais (`planned_deadline`, `prototype_deadline`, `delivery_deadline`), statuts ressources (`material_status`, `tooling_status`, `study_status`), `observation` + `notes_updated_at`, `category`, `reintegrated_at`, `sale_price_per_unit`, `proforma_number`, `technical_complexity` |
| `production_steps` | Étapes de production d'une commande | `order_id` → orders, `operation_id` → operations, `operator_id` → operators, `subcontractor_id` → subcontractors, `estimated_duration` (min), dates/heures début-fin, `depends_on` + `depends_on_percentage`, `step_order`, `frozen`, `equipment_ids[]`, statuts ressources par étape, champs sous-traitance (`subcontracting_done`, `subcontracting_cost`, `subcontracting_margin`, deadlines), relais de poste (`shift_started_date`, `shift_ended_date`), `raw_material_items` / `special_tooling_items` (jsonb), `hourly_rate`, `non_billable`, `planning_order` |
| `production_records` | Enregistrements de travail réel (registre) | `step_id`, `order_id`, `operator_id`, `operation_id`, `actual_duration` (min), `work_status` (done/continue/…), `work_date`, `start_time`/`end_time`, `pause_minutes`, `non_billable_hours` + `non_billable_reason`, `billable_hours` (trigger `compute_billable_hours`), snapshots (trigger `populate_production_record_snapshots`) |
| `quality_control_entries` | Contrôles qualité | `order_id`, `control_date`, `decision` (enum `qc_decision` : conforme, reprise-retouche, conforme-derogation, non-conforme), `controlled_qty`/`accepted_qty`/`rejected_qty`/`pending_qty`, `rework_notes`, `force_closed` |
| `delivery_entries` | Décisions de livraison | `order_id`, `control_date`, `decision` (enum `delivery_decision` : conforme, conforme-derogation), `delivered_qty`, `force_closed` |
| `delivered_orders` | Commandes livrées (archive active) | `order_id`, `delivery_date`, `sale_price_status` (gratuit, non-calcule, non-valide, valide), `invoice_number`, `invoice_date`, `delivered_qty`, `force_closed` |
| `cancelled_orders` | Commandes annulées (snapshots) | `order_id`, snapshots (numéro, client, désignation, quantité, date), `cancel_date`, `reason` |
| `order_attachments` | Pièces jointes des commandes | `order_id`, `file_path`/`file_name`/`file_type`/`file_size` (bucket `order-attachments`), `uploaded_by` → auth.users |

## Ressources atelier

| Table | Rôle | Points clés |
|---|---|---|
| `operators` | Opérateurs | `name`, `main_function` + `secondary_functions[]` (compétences), `main_equipment` → equipments, `secondary_equipments[]` |
| `equipments` | Parc machines | `designation`, `type` (enum `equipment_type` : 14 types), `capacity`, `state` (enum `equipment_state` : 4 états) |
| `operations` | Opérations | `name`, `category` (enum `operation_category` : operator / subcontractor), `hourly_rate_1`, `hourly_rate_2` |
| `subcontractors` | Sous-traitants | `company_name`, `main_activity` + `secondary_activities[]`, représentants/coordonnées (jsonb + arrays) |
| `holidays` | Jours fériés | `date`, `name` — exclus des calculs de durée |
| `clients` | Clients | `name`, `client_class` (enum A–E), `representatives` (jsonb), `phones[]`, `addresses[]`, `emails[]`, `address_details` (jsonb), `activity` |

## Matières premières et achats

| Table | Rôle | Points clés |
|---|---|---|
| `materials` | Fiches matière | `code` immuable `Id####` (trigger `materials_code_immutable`, séquence `materials_code_seq`), `grade_id`/`format_id`/`dimension_id`, `order_unit_id`, `purchase_unit_id` |
| `material_grades` | Nuances | `libelle_fr`/`libelle_ar`, `density_id` → material_densities |
| `material_formats` | Formats | `libelle_fr`/`libelle_ar`, `shape` |
| `material_dimensions` | Dimensions | `libelle` |
| `material_units` | Unités | `libelle_fr`/`libelle_ar`, `mm_per_unit` |
| `material_densities` | Masses volumiques | `libelle`, `value`, `unit` |
| `material_suppliers` | Fournisseurs par matière | unique (material_id, supplier_id) |
| `material_purchases` | Achats de matière (en-tête) | `purchase_date`, `supplier_id`, `document_ref` |
| `material_purchase_lines` | Lignes d'achat | `line_type`, `material_id`, `component_kind`, `quantity`, `unit_id`, `unit_price`, `fee_label`, `amount`, `order_id`/`order_item_id` (lien commande), `related_line_id` |
| `material_purchase_prices` | Historique des prix d'achat | `purchase_date`, grade/format/dimension, `supplier_id`, `unit_price`, `price_unit_id`, `currency` — droit confidentiel n° 30 |
| `material_purchase_attachments` | Pièces jointes d'achat | `purchase_id`, `file_path`… (bucket `purchase-documents`) |
| `suppliers` | Fournisseurs | `name`, coordonnées, `is_internal_stock` (un seul « Stock magasin », index unique partiel) |

## Documents commerciaux (socle en place, tables VIDES au 04/11/2026)

| Table | Rôle | Points clés |
|---|---|---|
| `purchase_orders` / `purchase_order_lines` | Bons de commande fournisseur | `number` (auto via `next_document_number`), `status`, `party_snapshot` (jsonb), totaux HT/TVA/TTC, lignes avec `tax_rate_percent`, lien source commande/étape (`source_order_id`, `source_step_id`) |
| `goods_receipts` / `goods_receipt_lines` | Bons de réception | liés à `purchase_order_id`, `received_weight_kg`, prix facturé |
| `delivery_notes` / `delivery_note_lines` | Bons de livraison | `client_id`, `delivery_address_snapshot`, `show_prices` |
| `invoices` / `invoice_lines` | Factures | `invoice_date`, `due_date`, `currency`, `stamp_duty_amount`, `amount_paid` (rafraîchi par `invoice_refresh_payment`) |
| `credit_notes` / `credit_note_lines` | Avoirs | liés à `invoice_id`, `reason_category` |
| `payments` / `payment_allocations` | Règlements et imputations | `method`, `reference`, imputations par facture (triggers `allocation_guard`, `payment_after_status`) |
| `tax_rates` | Taux de TVA | `code`, `rate_percent`, `kind`, `sort_order` |
| `company_settings` | Informations de l'entreprise | singleton (`singleton` boolean), noms FR/AR, identifiants (jsonb), logo, mentions légales |
| `document_sequences` | Compteurs de numérotation | (doc_type, year, last_number) — **aucune policy**, accès uniquement via `next_document_number` (security definer) |

Triggers communs : `doc_header_guard`, `doc_line_guard`, `doc_recompute_totals`, `*_line_compute`, `*_header_checks`, `*_after_status`, `forbid_delete` (pas de suppression, annulation uniquement).

## Comptes, droits et audit

| Table | Rôle | Points clés |
|---|---|---|
| `profiles` | Profils utilisateurs | `id` → auth.users (CASCADE), `display_name`, `role`, `status`, `force_password_change` ; triggers `populate_user_rights_on_new_profile`, `prevent_multiple_admins` |
| `rights_catalog` | Catalogue des 38 droits | `ordre`, quadruplet (tableau, formulaire, sous_formulaire, champ_bouton), `libelle_fr`/`libelle_ar`, `is_confidential` — lecture seule (pas d'INSERT/UPDATE/DELETE) |
| `user_rights` | Droits accordés | `user_id` → profiles, quadruplet, `niveau_acces` (RW/RO/delegate) |
| `audit_log` | Journal d'audit | `user_id`, `action`, `details` (jsonb) — INSERT/UPDATE/DELETE refusés sauf via fonctions ; contient les traces `SHADOW_RBAC_WOULD_BLOCK` |
| `health_incidents` | Incidents de santé du backend | `occurred_at`, `error_type`, `http_status`, `source`, `details` — alimenté par la fonction `health` |

## Vues et séquence

- **`material_last_purchase_price`** (vue) : dernier prix d'achat par matière.
- **`material_supplier_last_prices`** (vue, `security_invoker`) : dernier prix par matière et fournisseur (1059 lignes au 02/11/2026).
- **`materials_code_seq`** (séquence) : numérotation des codes matière `Id####` (valeur 194 au 02/11/2026).

## Enums

- `client_class` : A, B, C, D, E
- `delivery_decision` : conforme, conforme-derogation
- `equipment_state` : En marche, Mode dégradé, Maintenance/réparation, En panne
- `equipment_type` : 14 types de machines (tours, fraiseuses, rectifieuses, perceuses, scies…)
- `operation_category` : operator, subcontractor
- `order_priority` : P1, P2, P3, P4, P5, undetermined (usage documenté : P1–P4)
- `qc_decision` : conforme, reprise-retouche, conforme-derogation, non-conforme
- `resource_status` : disponible, non-disponible, partiel, non-applicable
- `sale_price_status` : gratuit, non-calcule, non-valide, valide
