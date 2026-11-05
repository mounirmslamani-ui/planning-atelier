# 01 — Pièges, décisions et dette technique

Tout ce qui n'est pas évident à la lecture du code. Pour chaque point : la règle, sa raison, et où elle est implémentée.

## 1. Limite de 1000 lignes de l'API (PostgREST)

- **Règle** : toute requête `supabase.from(...).select(...)` sur une table pouvant approcher 1000 lignes DOIT passer par le helper `fetchAllPaginated` (`src/lib/supabase-data.ts`). Interdit : `.range()` seul, `.limit(n)` arbitraire, ou requête sans pagination explicite. Toujours ajouter un `.order()` déterministe.
- **Raison** : PostgREST applique un plafond serveur `max-rows` (défaut 1000) qui **tronque silencieusement** le résultat. Bug réel constaté : la commande F173/26 était invisible car `orders` avait 1013 lignes triées en `created_at DESC`.
- **Tables déjà concernées** (volumes au 02/11/2026) : `orders` (1581), `production_records` (3088), `production_steps` (2452), `quality_control_entries` (1513), `delivered_orders` (1230), `material_suppliers` (1065).
- S'applique aussi aux pages qui requêtent la base directement (ex. `PlanningTableauPage` qui charge `production_steps`).

## 2. Dates et fuseau horaire

- La base est en **UTC** (`SHOW timezone` = UTC). L'atelier est à Casablanca (UTC+0/UTC+1 selon la période) : méfiance sur les décalages d'une heure lors des conversions.
- **Convention** : affichage `dd/mm/yyyy` dans l'interface, stockage ISO `yyyy-mm-dd` en base.
- Le helper `toISODate` (`src/lib/supabase-data.ts`) convertit systématiquement les dates avant insertion. Ne jamais insérer une date au format français directement.
- L'import Excel (`src/lib/ExcelImport...`, copier-coller tabulé) convertit les dates en ISO pour éviter les décalages.

## 3. RLS, droits et pièges d'interaction

- Le filtrage RLS est **silencieux** : une requête peut renvoyer 0 ligne sans erreur si les policies bloquent. Avant de conclure à un bug métier, vérifier `can_read`/`can_write` et le rôle de l'utilisateur.
- Les fonctions `can_read`, `can_write`, `is_admin` sont `security definer` : elles lisent `profiles`/`user_rights` sans être elles-mêmes bloquées par RLS.
- **Court-circuit admin** : `is_admin(uid) = true` rend `can_read`/`can_write` vrais sans ligne `user_rights`. Un admin peut donc n'avoir aucune ligne dans `user_rights` et tout faire.
- **Droits confidentiels** (migration drizzle `0003_confidential_rights_no_auto_grant.sql`) : les droits marqués `is_confidential = true` (n° 30, 31, 35, 36, 37, 38) ne sont **pas** accordés automatiquement à la création d'un profil ; ils doivent être accordés explicitement.
- `document_sequences` n'a **aucune policy** (SELECT/INSERT/UPDATE/DELETE refusés à tous) : elle n'est accessible que via la fonction `security definer` `next_document_number`. C'est voulu (compteurs de numérotation inviolables).
- Un `REVOKE DELETE` global a été appliqué sur les tables de documents commerciaux (migration `0007`) + trigger `forbid_delete` : ces documents ne se suppriment jamais, ils s'**annulent** (statut + `cancelled_at` + `cancel_reason`).

## 4. Doublons de numéros de commande

- Le trigger `prevent_duplicate_order_number` (sur `orders`) refuse tout doublon de `order_number`, comparaison **insensible à la casse et aux espaces** (`lower(btrim(...))`). Il lève : `Erreur : Ce numéro de commande existe déjà...`.
- La suppression définitive d'une commande (hard delete, `src/lib/supabase-data.ts` ~l.791) supprime toutes les lignes dépendantes pour **libérer le numéro**.

## 5. Historique de production additif (à ne JAMAIS casser)

- Toute étape ayant un `production_records` avec `work_status` `done`/`continue`, ou une étape de sous-traitance avec `subcontracting_done = true`, est **HISTORIQUE et immuable**.
- Dans `OrderPlanningDialog.handlePlanifier` : identifier `historicalStepIds` avant tout `deleteStep`, ne supprimer que les étapes non historiques, ne replanifier que les lignes sans étape historique, passer les étapes historiques au scheduler comme obstacles inamovibles, et numéroter les nouvelles étapes à partir de `historicalStepIds.size + 1`.
- **Raison** : préserver la chronologie complète (étude → livraison) après une Reprise/Retouche. Sans cela, les étapes validées disparaissent du Rapport et de la fenêtre d'attribution.

## 6. Ratio Critique (CR) — INTERDIT

- Le Ratio Critique / Critical Ratio / CR a été **supprimé** du programme. Ne pas le calculer, ne pas l'afficher, ne pas l'utiliser pour le tri ou l'ordonnancement, ne pas réintroduire d'icône ou de colonne CR.
- Priorités : **P1 à P4 uniquement** (libellés arabes, ex. P1 = مستعجل-أولوية قصوى). Le statut « قيد الانتظار » (En attente) a été supprimé.

## 7. Planning tableau = maître, Gantt = esclave

- Le **Planning tableau** (`/planning-tableau`) est la vue maîtresse : ordre manuel validé (index C_n) = référence absolue. Tout tri automatique imposé est proscrit ; le tri au chargement se base strictement sur l'index validé.
- Mode **brouillon** (`draftSteps`) : les modifications restent locales jusqu'au clic sur « Valider » (bouton orange clignotant si modifications non enregistrées), qui fige l'ordre en base et déclenche le recalcul séquentiel des dates « à partir d'aujourd'hui 07h00 » (à vérifier : les horaires de travail documentés commencent à 08h00 — l'heure exacte de départ du recalcul est à confirmer dans le code du scheduler).
- Le **Gantt** est strictement en lecture seule (visualisation, 3 échelles, recherche par contraste).
- Undo/Redo : 50 snapshots, boutons ⟲/⟳ et Ctrl+Z / Ctrl+Y, sur Gantt, Commandes en cours et Planning tableau.

## 8. Pannes récurrentes du backend (IMPORTANT — exploitation)

- **Symptôme** : écran de login affiche « الخدمة غير متوفرة مؤقتا » (HTTP 503) ou « اسم المستخدم غير موجود » à tort, parfois écran blanc ; la fonction `resolve-user-email` ne répond plus.
- **Cause identifiée** : épuisement du **budget d'IO disque** de l'instance (alerte « DiskIO budget exhausted » dans les métriques). Ce n'est **pas** un problème d'espace disque (disque ~4 % plein). Quand le budget IO tombe à 0, la base se verrouille et tout s'arrête.
- **Occurrences documentées** : 12/10/2026 ~21h40-22h05 UTC (intermittent), 21/10/2026 17h36 (IO à 0) → rétabli 18h52, 01/11/2026 (pause pour épuisement de crédits) → rétabli 17h22, 04/11/2026.
- **Procédure de rétablissement** : vérifier l'état du backend → relancer l'instance → patienter 8 à 10 minutes → vérifier avec une recherche de nom fictif sur `resolve-user-email` (la réponse attendue est un 404 « اسم المستخدم غير موجود » en moins d'une seconde).
- **Piste d'allègement non implémentée (à vérifier / décision en attente)** : `src/context/PlanningContext.tsx` relance un rechargement complet de toutes les commandes toutes les 60 secondes (`setInterval(..., 60_000)`). Plusieurs écrans ouverts toute la journée consomment le quota IO rapidement. Deux options proposées à l'utilisateur, sans réponse à ce jour : (1) passer à une instance plus grande, (2) réduire ces rechargements pour ne récupérer que les changements.

## 9. Relais de poste en mode observation (SHADOW_RBAC_WOULD_BLOCK)

- Migration RBAC du 03/08/2026 : policies RLS + triggers `enforce_rbac_orders` / `enforce_rbac_production_steps`, fonction `can_write`, niveaux réduits à RW/RO/delegate.
- Le bloc « بداية / تبديل / نهاية الدوام » (colonnes `shift_started_date` / `shift_ended_date` de `production_steps`) est en **observation seule** : aucun `RAISE EXCEPTION`, seulement un INSERT dans `audit_log` avec `action = 'SHADOW_RBAC_WOULD_BLOCK'`.
- Requête de revue : `select details->>'order_id', count(*) from audit_log where action='SHADOW_RBAC_WOULD_BLOCK' group by 1;` — la décision d'activer le blocage réel (et/ou d'accorder RW à ريمة / ليليا) reste à prendre.

## 10. Fichiers générés automatiquement — ne JAMAIS éditer

- `src/integrations/supabase/client.ts`, `src/integrations/supabase/previewAuthStorage.ts`, `src/integrations/supabase/types.ts` : régénérés par la plateforme.
- `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`).
- `supabase/config.toml` (réglages projet ; un seul fichier `config.toml`).

## 11. Double historique de migrations

- Deux séries coexistent : `supabase/migrations/` (67 fichiers, historique ancien) et `drizzle/migrations/` (0000 → 0011, historique récent piloté par drizzle-kit, avec `meta/_journal.json` + snapshots).
- Écart constaté (audit du 02/11/2026) : 67 fichiers `supabase/migrations` pour 66 versions appliquées ; deux fichiers sans version appliquée correspondante — `20260915120000_add_step_non_billable.sql` et `20261001153000_create_material_reference_tables.sql` — dont les effets existent pourtant en base (appliqués par une autre voie ; le second correspond vraisemblablement à `drizzle/migrations/0000_create_material_reference_tables.sql`).
- Le schéma `drizzle` (journal en base) n'est pas lisible avec les droits courants : l'état d'application exact des migrations drizzle n'est pas vérifiable côté base (à vérifier si un accès plus large devient disponible).

## 12. Export de sauvegarde — règles d'architecture

- Page « تصدير النسخة الاحتياطية » (`/backup-export`), réservée à l'admin avec vérification `is_admin` **côté serveur** dans la fonction `backup-export`.
- La fonction est en lecture seule avec un **catalogue fixe** de tables publiques (`supabase/functions/backup-export/catalog.ts`) : pas de requête arbitraire, pas d'identifiants privilégiés exposés.
- Les colonnes numériques sont **converties en texte** dans l'API avant le parsing JSON, pour préserver la précision exacte.
- À préserver : NULL, JSONB, dates ISO avec fuseau, chemins/noms UTF-8 des fichiers, y compris les fichiers orphelins (présents dans le bucket sans ligne en table).
- Écart connu (audit du 02/11/2026) : 4 fichiers du bucket `order-attachments` sans ligne correspondante dans la table `order_attachments`.

## 13. Fonctionnalités inachevées ou volontairement désactivées

- **Documents commerciaux** (factures, avoirs, bons de livraison, bons de commande fournisseur, bons de réception, règlements) : tout le socle existe en base (15 tables, triggers de calcul, numérotation `next_document_number`, droits 32–38, migrations drizzle 0006–0007) mais **toutes ces tables sont vides** au 04/11/2026 — le module n'est pas encore utilisé. Seule la facturation simplifiée est active : colonne `invoice_number` sur `delivered_orders` + page « طلبيات في انتظار الفوترة » (`/pending-invoicing`).
- **`index.html`** : titre et métadonnées encore aux valeurs par défaut du template (« Lovable App », « Lovable Generated Project », image og Lovable) — jamais personnalisés.
- Lignes « Sous-traitance » et « Achats » **supprimées** du Gantt (volontaire) : seules les lignes opérateurs restent.
- Colonne « Équipements » supprimée de la fenêtre « Définition des tâches et affectations » (volontaire).
- `suppliers.is_internal_stock` (migration 0010, fournisseur « Stock magasin ») existe en base mais le frontend ne l'exploite pas encore (à vérifier : traitement différencié à définir avec l'utilisateur).

## 14. Divers

- `orders` accepte une ligne spéciale `order_number = 'ABS'` (voir `src/lib/supabase-data.ts` ~l.942) liée à la gestion des absences — séparation stricte : une « Absence » ne doit jamais être associée à une commande réelle.
- `materials.code` (format `Id####`, séquence `materials_code_seq`) est **immuable** : trigger `materials_code_immutable`.
- Les commandes transférées vers « Commandes à livrer » ne sont **pas supprimées** de la base (visibilité dans le tableau final).
- Infobulle « Modifié le … » sur la cellule ملاحظات : `orders.notes_updated_at` est estampillé automatiquement dans `PlanningContext.updateOrder` (source unique — couvre tous les chemins d'édition).
