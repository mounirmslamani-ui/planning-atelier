# 02 — Règles métier de l'atelier

## 1. Cycle de vie d'une commande

1. **Création** (سجل الطلبيات / « Commandes en cours ») : numéro, date, client, désignation, quantité, priorité, délais, suivi des ressources (Étude, Matière, Outillage).
2. **Définition des tâches** (fenêtre « Définition des tâches et affectations ») : étapes de production (`production_steps`) avec opération, durée estimée, ressource (opérateur ou sous-traitant), dépendances, et 4 cases à cocher de prérequis (Étude, Matière, Outillage, Sous-traitance). Décocher une case ouvre une saisie de « Date prévue » et bascule l'étape en suivi (pages dédiées Étude / Achats matière / Achats outillage / Sous-traitance).
3. **Ordonnancement** : le « Planning tableau » (جدول البرمجة) est la vue maîtresse ; le bouton « Valider » fige l'ordre et recalcule les dates.
4. **Exécution** : enregistrements de production (`production_records`, سجل الأعمال المنجزée / registre de production) avec opérateur, opération, durée réelle, heures non facturables.
5. **Bascule automatique en Contrôle Qualité** : quand le dernier bloc validé d'une commande (icône ⚙✓) est terminé et qu'aucun autre bloc n'est planifié, la commande passe de « Commandes en cours » à « Contrôle Qualité ».
6. **Contrôle qualité** (`quality_control_entries`, décisions `qc_decision`) :
   - **Conforme** ou **Conforme avec dérogation** → transfert vers « Commandes à livrer ». La commande n'est PAS supprimée de la base lors du transfert (visibilité dans le tableau final).
   - **Reprise/Retouche** → retour en production avec saisie des corrections.
   - **Non-conforme** → la commande reste en QC.
   - Quantités partielles : `controlled_qty`, `accepted_qty`, `rejected_qty`, `pending_qty`.
7. **Livraison** (`delivery_entries` → `delivered_orders`) : date de livraison, statut du prix de vente (`sale_price_status` : gratuit, non-calcule, non-valide, valide), quantité livrée, numéro et date de facture (`invoice_number`, `invoice_date`).
8. **Annulation** (`cancelled_orders`) : snapshot de la commande (numéro, client, désignation, quantité, date), date et motif d'annulation.
9. **Réintégration** : une commande annulée peut être réintégrée (`orders.reintegrated_at`), droit n° 22 « إعادة إدماج ». Les étapes historiques (terminées ou sous-traitance validée) ne sont jamais supprimées (voir docs/01 §5).

**Clôtures manuelles** : `force_closed` sur `quality_control_entries` et `delivery_entries` / `delivered_orders`, droits n° 23 (إقفال مراقبة الجودة يدوياً) et n° 24 (إقفال التسليم يدوياً). Droit n° 25 (حذف جلسة) pour supprimer une session QC ou livraison.

## 2. Numéros de commande

- Séries avec préfixe lettre + numéro + année : préfixes **F** et **P** observés (ex. F173/26), regroupement par préfixe puis année (25/ avant 26/) dans la page de facturation. Format exact complet : à vérifier dans le code de saisie.
- Unicité garantie par le trigger `prevent_duplicate_order_number` (insensible à la casse et aux espaces).
- `orders.proforma_number` : numéro de proforma (droit n° 31, migration 0004).

## 3. Priorités et statuts

- **Priorités P1 à P4 uniquement** (enum `order_priority` : P1, P2, P3, P4, P5, undetermined — P5 et undetermined existent dans l'enum mais l'usage documenté est P1–P4 ; à vérifier). Libellés arabes, ex. P1 = مستعجل-أولوية قصوى. Le statut « قيد الانتظار » et le Ratio Critique (CR) ont été supprimés et ne doivent pas réapparaître.
- **Statuts de ressources** (enum `resource_status`) : disponible, non-disponible, partiel, non-applicable — sur la commande (`material_status`, `tooling_status`, `study_status`) et sur chaque étape.
- **Synchronisation bidirectionnelle** : l'état de la commande reflète le « pire cas » de ses étapes ; modifier la commande propage le statut à toutes ses étapes.
- Nouvelles commandes sans index : insérées **au sommet de leur groupe de priorité** (P1 > P4) comme alerte visuelle.

## 4. Programmation (برمجة)

- **Semaine de travail** : dimanche → jeudi. Week-end : vendredi et samedi.
- **Horaires** : 08h00–12h00 et 12h30–16h00 (7,5 h/jour). La pause déjeuner et les jours fériés (table `holidays`, page n'affichant que les dates futures) sont exclus des calculs de durée et du rendu du planning (le Gantt compresse le temps pour ne montrer que les périodes travaillées).
- **Calcul automatique** du troisième champ (début, fin ou durée) à la saisie des étapes. Unité selon la ressource :
  - **Opérateur** : heures, pas de 0,25 h.
  - **Sous-traitant** : jours, 1 jour = 7,5 h = 450 min, pas de 0,5 j.
- **Moteur d'ordonnancement** : l'ordre manuel validé (C_n) est la référence absolue ; le bouton « Valider » (orange clignotant si modifications non enregistrées) fige l'ordre en base et déclenche le recalcul séquentiel des dates à partir d'aujourd'hui (heure de départ : à vérifier, mémoire « 07h00 » vs horaires 08h00).
- **Dépendances entre étapes** : `depends_on` + `depends_on_percentage` (progression en %), liaison par Ctrl+Click.
- **Capacité opérateur** : chaque opérateur a un équipement principal et des équipements secondaires ; il n'est affectable qu'aux machines sur lesquelles il est qualifié. Compétence principale + secondaires (`main_function`, `secondary_functions`).
- **Charge opérateur** (affichée en orange sous son nom) = heures de production prévues / capacité disponible. Les absences sont exclues du calcul et **réduisent la capacité** (dénominateur) au lieu de s'ajouter aux heures.
- **Absences** : blocs jaunes, page dédiée (CRUD), seules les absences en cours ou futures sont affichées. À l'enregistrement d'une absence, tous les travaux de l'opérateur qui chevauchent la période sont **décalés automatiquement** après la fin de l'absence. Une absence n'est jamais associée à une commande réelle.
- **Équipements** : type (enum `equipment_type` : tours, fraiseuses, rectifieuses, etc.) et état (enum `equipment_state` : En marche, Mode dégradé, Maintenance/réparation, En panne).

## 5. Heures facturables

- Trigger `compute_billable_hours` sur `production_records` :
  `billable_hours = GREATEST(0, ROUND(actual_duration / 60.0, 2) - COALESCE(non_billable_hours, 0))`
  (durée réelle en minutes → heures, moins les heures non facturables, plancher à 0).
- `production_records.non_billable_hours` + `non_billable_reason` ; `production_steps.non_billable` (colonne ajoutée par la migration `20260915120000_add_step_non_billable.sql`).
- Le registre de production (سجل الأعمال المنجزة) est un historique CRUD complet ; modification et suppression réservées aux droits n° 26 et 27, avec alerte de désynchronisation si la commande a déjà progressé vers QC/livraison. Anti-doublon et export Excel inclus.
- Snapshots sur `production_records` (numéro, client, désignation, quantité, opération) remplis par le trigger `populate_production_record_snapshots` : l'historique survit aux changements de la commande.

## 6. Achats de matières premières

- **Référentiels** (droit n° 29 مرجعيات المادة الأولية) : nuances (`material_grades`, avec `density_id`), formats (`material_formats`, avec `shape`), dimensions (`material_dimensions`), unités (`material_units`, avec `mm_per_unit`), masses volumiques (`material_densities`).
- **Fiches matière** (`materials`) : combinaison nuance + format + dimension, code immuable `Id####` (séquence `materials_code_seq`, trigger `materials_code_immutable`), unités de commande et d'achat (`order_unit_id`, `purchase_unit_id`).
- **Fournisseurs par matière** (`material_suppliers`) : unique (material_id, supplier_id).
- **Prix d'achat** (`material_purchase_prices`, droit confidentiel n° 30) : date, nuance, format, dimension, fournisseur, prix unitaire, unité de prix, devise, quantité, référence document. Vues `material_last_purchase_price` et `material_supplier_last_prices` = **prix du dernier achat**.
- **Achats** (`material_purchases` + `material_purchase_lines`) : lignes de type matière ou frais (`component_kind`, `fee_label`), fonction `record_material_purchase(...)` (security definer) pour enregistrer un achat complet.
- **Calcul de poids** : poids estimé sur les lignes de commande fournisseur (`estimated_weight_kg`), poids reçu sur les réceptions (`received_weight_kg`), via densité × dimensions × quantité (détail exact des formules : à vérifier dans les triggers `po_line_compute` / `gr_line_compute`).
- **Pièces jointes d'achat** (`material_purchase_attachments`, bucket `purchase-documents`, droit n° 30).
- **Stock interne** : `suppliers.is_internal_stock` + fournisseur « Stock magasin » (un seul autorisé, index unique partiel) — pas encore exploité côté interface.

## 7. Sous-traitants

- Prestataires externes (`subcontractors`) : activité principale + activités secondaires, représentants, coordonnées.
- Affectables comme ressource d'une étape au même titre qu'un opérateur (`production_steps.subcontractor_id`), avec `subcontracting_cost`, `subcontracting_margin`, `subcontracting_deadline`, `subcontracting_done`, `subcontracting_received_date`.
- Opérations catégorisées (`operations.category` : `operator` / `subcontractor`) : la catégorie filtre les listes de compétences et les options de planification.

## 8. Clients

- Classification A → E (enum `client_class`) selon importance stratégique, régularité et fiabilité de paiement : A = partenaires stratégiques … E = clients sous conditions/litiges. Badges colorés.
- Fiche client : représentants (jsonb), téléphones, adresses, e-mails, `address_details`, `activity`.

## 9. Facturation (version simplifiée active)

- `delivered_orders.invoice_number` nullable : vide → « في الانتظار » ; clic sur la cellule → saisie/effacement du numéro.
- Page « طلبيات في انتظار الفوترة » (`/pending-invoicing`, droit n° 31) : agrège commandes livrées sans numéro de facture, prêtes à livrer, en QC, en cours, en attente, P4. Regroupement par client puis préfixe de série (F/P) puis année. 10 colonnes opérateurs nommées (محمود، بلال، صالح، عبد الرزاق، حمزة، عمر، ياسين، معاذ، عادل، يوسف), colonnes معالجة حرارية / مناولة / المواد الأولية المستعملة dérivées des étapes. Disparition automatique dès que le numéro de facture est renseigné. Export Excel « Commandes non facturées ».

## 10. Documents commerciaux — socle en base, NON utilisés

Les tables suivantes existent (migrations drizzle 0006–0007) avec triggers de calcul (`invoice_line_compute`, `cn_line_compute`, `dn_line_compute`, `gr_line_compute`, `po_line_compute`, `doc_recompute_totals`), numérotation automatique (`next_document_number` + `document_sequences`), snapshots de tiers (`doc_party_snapshot`), gardes (`doc_header_guard`, `doc_line_guard`, contrôles d'en-tête) et droits 32–38 — mais **toutes sont vides au 04/11/2026** car le module n'est pas encore utilisé :

| Tables | Document | Droit |
|---|---|---|
| `purchase_orders`, `purchase_order_lines` | Bons de commande fournisseur | 32 سندات الطلب |
| `goods_receipts`, `goods_receipt_lines` | Bons de réception | 33 وصولات الاستلام |
| `delivery_notes`, `delivery_note_lines` | Bons de livraison | 34 وصولات التسليم |
| `invoices`, `invoice_lines` | Factures | 35 الفواتير (confidentiel) |
| `credit_notes`, `credit_note_lines` | Factures d'avoir | 36 فواتير الاسترجاع (confidentiel) |
| `payments`, `payment_allocations` | Règlements | 37 التسديدات (confidentiel) |
| `company_settings` | Informations de l'entreprise | 38 معلومات الشركة (confidentiel) |
| `tax_rates` | Taux de TVA | — |
| `document_sequences` | Compteurs de numérotation | accès uniquement via `next_document_number` |

Règle commune : ces documents ne se suppriment jamais (REVOKE DELETE + trigger `forbid_delete`) ; ils s'annulent (`cancelled_at` + `cancel_reason`).
