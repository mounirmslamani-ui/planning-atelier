# Refonte : بطاقة متابعة إنجاز الطلبية (Fiche Unique de Suivi)

## Objectif
Centraliser toute la saisie et le suivi d'une commande dans **un seul document à 4 onglets**, ouvert depuis le tableau de planning ou le registre. Les anciennes fenêtres isolées disparaissent au profit d'un CRUD strict par ID. Aucune donnée Supabase n'est supprimée, aucune règle métier acquise n'est modifiée.

## Garde-fous (non-régression stricte)
- Terme **خابور** conservé partout dans l'UI.
- Dialogue arabe de forçage des ressources au vert à la clôture d'étape inchangé.
- Calcul automatique des 30 min de pause (12:00–12:30) inchangé.
- Schéma Supabase préservé : on **ajoute uniquement** ce qui manque, on ne renomme ni ne supprime aucune colonne ou table existante.
- Hooks, libs et flux déjà fiabilisés (`orderFlow.ts`, `preparationFilter.ts`, `useReintegrateOrder`, compteurs `lastSeriesNumbers`, validations CRUD du dialog de planning, calcul temps réel) sont **réutilisés tels quels** dans la nouvelle fiche.

## 1. Nettoyage de l'ancienne architecture (UI uniquement)
- Les anciennes pop-ups indépendantes (définition ressources, ajout/modif étapes, saisie production, validation QC) ne sont plus accessibles depuis les tableaux globaux.
- `OrdersPage` → titre renommé **ترتيب إنجاز الطلبيات الحالية**. Lecture seule + Drag & Drop d'ordre conservé. Le clic sur une ligne ouvre la Fiche Unique.
- `OrderRegistryPage` → reste un registre lecture. Le clic sur une ligne ouvre la Fiche Unique.
- Les pages dédiées (Production Register, Quality Control, Delivery, Material/Tooling/Study) restent accessibles via la sidebar pour les vues transversales, mais leurs dialogs internes sont remplacés par un bouton « فتح البطاقة » qui ouvre la Fiche Unique sur l'onglet pertinent.

## 2. Fiche Unique : `OrderTrackingSheet` (4 onglets)
Nouveau composant `src/components/OrderTrackingSheet.tsx` (extension du fichier existant) basé sur `Dialog` + `Tabs`, large (≥1100px), RTL. En-tête persistant : N° commande, client, désignation, quantité, statut global, badge priorité, bouton **🖨 طباعة البطاقة**.

Bandeau de compteurs en haut : derniers numéros (aa/Fxxx, aa/Pxxx, aa/Sxxx, aa/xxx) via `lastSeriesNumbers.ts`.

### Onglet 1 — معلومات الطلب والزبون
- Édition inline : numéro, catégorie, date de réception, délai promis, client + représentant, désignation, quantité, observation.
- `UPDATE` strict par `order.id`.

### Onglet 2 — تحضير الطلبية والموارد
- Vue par étape avec sous-cartes Matière / Outillage / Étude (statuts + dates), **indépendantes étape par étape** (déjà le cas dans `production_steps`).
- Réutilise les composants de `OrderPlanningDialog` pour les ressources.
- Le filtre `buildOutOfPreparationFlowSet` continue d'exclure rétroactivement les commandes conformes/prêtes/livrées/facturées des pages Achats & Étude.

### Onglet 3 — مراحل الإنجاز والتوقيت
- Réutilise `OrderPlanningDialog` (déjà durci : UPDATE par ID, `step_order` normalisé, validation anti-doublon, confirmation « Voulez-vous enregistrer ces X étapes ? »).
- Verrou d'ordre : on conserve `step_order` existant comme `step_index` immuable côté UI (pas de réindexation lors d'un UPDATE simple).
- **Passage de relais** : bouton « إنهاء يدوياً » sur une étape en cours à 0h restantes → marque l'étape `Terminée` sans bloquer ; permet d'ajouter une nouvelle étape pour un autre opérateur sur la même opération (déjà résolu, on l'expose dans l'onglet).
- Section **سجل الأشغال المنجزة** (filtrée sur la commande) avec les 4 champs HH:mm (début, fin, pause défaut 00:30 si chevauche midi, durée calculée) + champ `تاريخ الأشغال`. Colonnes optimisées, horodatage système masqué (déjà en place dans `ProductionRegisterPage`, on réutilise les helpers).

### Onglet 4 — مراقبة الجودة والتسليم
- Liste des contrôles QC successifs (historique conservé).
- Action **Conforme** → crée l'entrée delivery + retire automatiquement la commande de `ترتيب إنجاز الطلبيات الحالية` (déjà géré par `hasCurrentPostProductionFlow`).
- Action **Non conforme** → enregistre la décision sans casser l'historique.
- Bouton **إعادة إدماج** (réintégration n-ième) : utilise `useReintegrateOrder` existant, qui préserve les enregistrements précédents et tague `reintegratedAt` pour ouvrir un nouveau cycle.
- Bloc livraison + facturation (numéro de facture) lisible/éditable.

## 3. Version imprimable A4
- Bouton **🖨** dans l'en-tête de la fiche.
- Nouveau composant `PrintTrackingSheet` rendu dans un portail caché + classes `print:*` Tailwind et `@media print` global dans `index.css`.
- Format A4 portrait : en-tête (client, n°, qté, désignation, dates), tableau séquentiel des étapes (n°, opération, opérateur/équipement, durée estimée, durée réelle, statut), encadré signature « مراقبة الجودة ».
- Onglets, boutons et chrome web masqués à l'impression.

## 4. Base de données
Aucune migration destructive. Une seule migration additive si nécessaire :
- Ajout d'un index `idx_production_steps_order_step_order` sur `(order_id, step_order)` pour stabiliser l'affichage séquentiel (les colonnes existent déjà).
- Aucun renommage, aucune suppression.

## Détails techniques

### Fichiers créés
- `src/components/tracking-sheet/OrderTrackingSheetV2.tsx` (conteneur + tabs)
- `src/components/tracking-sheet/TabInfo.tsx`
- `src/components/tracking-sheet/TabResources.tsx`
- `src/components/tracking-sheet/TabSteps.tsx`
- `src/components/tracking-sheet/TabQuality.tsx`
- `src/components/tracking-sheet/PrintTrackingSheet.tsx`
- `src/components/tracking-sheet/SeriesCountersBanner.tsx`

### Fichiers modifiés
- `src/pages/OrdersPage.tsx` — titre AR mis à jour, clic ligne → ouvre la fiche ; D&D priorité conservé.
- `src/pages/OrderRegistryPage.tsx` — clic ligne → ouvre la fiche.
- `src/pages/PlanningTableauPage.tsx` — bouton « فتح البطاقة » sur chaque ligne.
- `src/pages/QualityControlPage.tsx`, `DeliveryPage.tsx`, `MaterialPurchasesPage.tsx`, `ToolingPurchasesPage.tsx`, `StudyPage.tsx`, `ProductionRegisterPage.tsx` — bouton « فتح البطاقة » qui ouvre la fiche sur le bon onglet.
- `src/index.css` — règles `@media print` (masque sidebar, boutons, onglets ; force A4).

### Données et règles préservées
- Toutes les fonctions de `src/lib/supabase-data.ts` restent inchangées.
- `useReintegrateOrder`, `useCancelOrder`, `buildOutOfActiveProductionSet`, `buildOutOfPreparationFlowSet`, `lastSeriesNumbers` réutilisés sans modification.
- Validation CRUD stricte des étapes (validation anti-doublon, normalisation `step_order`, dialogue de confirmation) restée dans `OrderPlanningDialog` et intégrée dans l'onglet 3.

## Hors périmètre
- Aucune modification du moteur de planification ou du Gantt.
- Aucun changement aux pages Operators / Operations / Clients / Subcontractors / Equipment / Holidays / Absences.
- Pas de nouvelle authentification.

## Critères d'acceptation
1. Cliquer une commande dans `ترتيب إنجاز الطلبيات الحالية` ou dans `سجل الطلبيات` ouvre la Fiche Unique avec les 4 onglets.
2. Les compteurs aa/Fxxx, aa/Pxxx, aa/Sxxx, aa/xxx s'affichent à jour en haut.
3. Modifier une étape met à jour la ligne existante (pas de doublon, pas d'inversion).
4. Marquer Conforme retire la commande de la vue active et la bascule dans « جاهزة للتسليم ».
5. Le bouton réintégration relance un cycle sans effacer les contrôles précédents.
6. L'impression produit une fiche A4 propre, sans onglets ni boutons.
7. Aucune donnée existante n'est supprimée ou corrompue.
