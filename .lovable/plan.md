# Plan — Gestion partielle du Contrôle Qualité et de la Livraison

## Objectif
Permettre des sessions multiples de CQ et de livraison avec quantités, sans casser le flux existant (commandes 100% conformes/livrées continuent de fonctionner comme avant). Une commande peut apparaître simultanément dans `طلبيات في انتظار مراقبة الجودة`, `طلبيات جاهزة للتسليم` et `طلبيات مسلمة` tant qu'elle n'est pas soldée.

---

## 1. Base de données (migration)

Ajouter des colonnes (nullable, défaut sûr) pour ne rien casser de l'existant :

- `quality_control_entries`
  - `controlled_qty integer` (quantité contrôlée dans la session)
  - `accepted_qty integer` (quantité conforme / éligible à la livraison)
  - `rejected_qty integer` (controlled − accepted, stocké pour traçabilité)
  - `force_closed boolean default false` (clôture forcée du CQ)
- `delivery_entries`
  - `delivered_qty integer` (quantité livrée dans la session)
  - `force_closed boolean default false`
- `delivered_orders`
  - `delivered_qty integer` (total livré côté historique cumulé d'une session)
  - `force_closed boolean default false`

Les anciennes lignes (qty NULL) seront traitées comme "couvrant la quantité totale de la commande" pour préserver le comportement actuel.

## 2. Types & data layer

- Étendre `QualityControlEntry`, `DeliveryEntry`, `DeliveredOrder` dans `src/types/planning.ts` avec les nouveaux champs (optionnels).
- Étendre le mapping snake_case ↔ camelCase dans `src/lib/supabase-data.ts` (lecture + insert + update).
- Étendre `PlanningContext` : 
  - `addQualityControlEntry` / `updateQualityControlEntry` acceptent les nouveaux champs.
  - `addDeliveryEntry` / `updateDeliveryEntry` idem.
  - `addDeliveredOrder` idem.
- Helpers (`src/lib/orderFlow.ts` nouveau ou existant) :
  - `getQCRemaining(order, qcEntries)` → quantité restante à contrôler
  - `getDeliverableRemaining(order, qcEntries, deliveryEntries)` → prêt à livrer non encore expédié
  - `getDeliveryRemaining(order, deliveredOrders)` → restant à livrer (total commande − total livré)
  - `isQCFullyClosed(order, qcEntries)` (accepté + rejeté ≥ qty OU force_closed)
  - `isDeliveryFullyClosed(order, deliveredOrders)` (livré ≥ accepté validé OU force_closed)

## 3. UI — Fiche بطاقة متابعة (`OrderUnifiedSheet.tsx`), onglet `مراقبة الجودة والتسليم`

### Section CQ
- Tableau des sessions CQ avec colonnes : `تاريخ المراقبة`, **`الكمية المراقبة`**, **`الكمية المقبولة`**, `القرار`, `ملاحظات`, actions.
- Bouton "+" en bout de dernière ligne **uniquement si** `sum(controlled) < order.quantity` et CQ non force-closed.
- Validation UI : `controlled ≤ remaining`, `accepted ≤ controlled`.
- Bouton **"Solder le CQ" (إقفال نهائي للمراقبة)** avec ConfirmDialog.

### Section Livraison
- Tableau des sessions de livraison avec colonnes : `تاريخ التسليم`, **`الكمية المسلمة`**, actions.
- Bouton "+" si `sum(delivered) < sum(accepted from QC)` et non force-closed.
- Validation : `delivered ≤ deliverableRemaining`.
- Bouton **"Solder la livraison"** avec ConfirmDialog.
- Indicateur d'état : `Livré X / Y`.

## 4. Pages listes — mise à jour de filtrage et affichage

- `QualityControlPage` : garder une commande tant que `!isQCFullyClosed`. Afficher `restant / total` (ex `6 / 10`).
- `DeliveryPage` : afficher toute commande qui a du `deliverableRemaining > 0` ET non force-closed. Afficher `prêt / total`.
- `DeliveredOrdersPage` : afficher chaque session livrée avec sa quantité (`livré / total`). Une commande peut apparaître plusieurs fois (une ligne par session) OU agrégée — **agrégée** par commande avec total cumulé (plus simple, à confirmer si besoin).
- Supprimer la transition exclusive actuelle (qui retire de la liste précédente). À la place, basée sur les helpers.

## 5. Rétro-compatibilité

- Lignes existantes sans `controlled_qty` → considérées comme `controlled = accepted = order.quantity` (comportement actuel).
- Lignes existantes `delivery_entries` / `delivered_orders` sans `delivered_qty` → `delivered = order.quantity`.
- Aucun changement de comportement pour les commandes déjà 100% traitées.

## 6. Hors-périmètre
- Pas d'opérateur dédié à la session CQ/Livraison (la spec le mentionne mais n'existe pas dans le modèle actuel — on conserve uniquement la date). À ajouter ultérieurement si demandé.
- Pas de modification du Gantt, planning, registre.

---

## Étapes d'exécution
1. Migration DB (4 colonnes).
2. Types + supabase-data mapping.
3. Helpers `orderFlow`.
4. Refonte de l'onglet QC/Livraison de `OrderUnifiedSheet`.
5. Mise à jour des 3 pages listes.
6. Vérif compilation + smoke test visuel.