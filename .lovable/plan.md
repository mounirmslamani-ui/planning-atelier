
## Objectif

Dans **تسيير الطلبيات الجارية** (`OrdersPage.tsx`) et **جدول البرمجة** (`PlanningTableauPage.tsx`), ne conserver **que l'ordre manuel** (glisser-déposer + dialogue "Déplacer la sélection"). Supprimer :
- toute logique d'ordonnancement automatique (tri par priorité/deadlines, insertion auto au top, recalcul de Pn pour suivre Cn, etc.) ;
- la notion de **verrouillage (cadenas)** : `frozenOrder` côté commande et `frozen` côté étape ne sont plus créés ni affichés ;
- les boutons et états visuels associés (icônes 🔒, "Trier auto", "ouvrir tous les verrous", indicateurs ⚠ de "position forcée", `WarningTriangleIcon` lié à un ordre non figé).

## Comportement final

### OrdersPage (تسيير الطلبيات الجارية)
- L'ordre des lignes est strictement celui du `displayOrder` stocké en base.
- L'ordre ne change **que** sur :
  - drag & drop manuel,
  - dialogue "Déplacer la sélection (Cn)".
- À chaque réorganisation manuelle, `displayOrder` est ré-attribué 1..N et persisté. Aucun champ `frozenOrder` n'est plus écrit.
- Les nouvelles commandes prennent `displayOrder = N+1` (comportement déjà en place).
- L'effet d'auto-réindexation qui comble les trous (`useEffect` qui réécrit 1..N quand une commande sort du flux) **est conservé** : ce n'est pas un tri automatique, c'est une simple renumérotation séquentielle indispensable pour garder Cn ∈ 1..N. Si tu préfères qu'on le retire aussi, dis-le.
- Suppression : `autoSortOrders`, `handleAutoSort`, bouton "Trier auto", colonne/icône cadenas, `unlockOrder`, `unlockAll`, `hasFrozenOrders`, `WarningTriangleIcon` "non figé" sur la cellule de tri.

### PlanningTableauPage (جدول البرمجة)
- L'ordre par opérateur est strictement le `planning_order` (Pn) stocké en base.
- Pn ne change **que** sur drag & drop manuel d'une ligne.
- Suppression : 
  - `insertNewStepsAtPriorityTop` (insertion auto par priorité des nouvelles étapes) → remplacé par : nouvelles étapes ajoutées à la **fin** de la liste de l'opérateur, sans réordonner les existantes ;
  - `handleAutoSort` + bouton "Trier auto" par opérateur ;
  - effet d'auto-recalcul des Pn pour combler les trous (`useEffect` après `operatorTasks`) → on garde un compactage 1..N **uniquement** quand une étape disparaît (terminée), pour éviter des trous de numérotation, mais sans réordonner ;
  - toute la notion `step.frozen` : bouton cadenas dans la colonne "عمليات", `toggleStepFrozen`, écriture de `frozen: true` lors d'un D&D ou d'une fin d'étape, indicateurs ⚠ "position forcée" (`isManualOrderViolation`, `orderWarning`, `studyWarning`, `materialWarning`, `toolingWarning`, `phaseWarning`, `forcedPhaseAmontWarnings`, `pendingDrop` chaîné), styles `bg-primary/5` liés à `step.frozen` ;
  - écriture de `frozenOrder` / `manualSortOrder` sur les commandes depuis `applyReorder` et `toggleStepFrozen`.
- Le dialogue chaîné de pré-requis (étude/matière/outillage/phase amont) avant un drop **est supprimé** puisqu'il servait uniquement à autoriser un "forçage" verrouillé. Le D&D devient inconditionnel.

### Hors périmètre — non modifié
- **Gantt** (`GanttChart.tsx`) : conserve sa propre logique `frozen` interne (lecture seule, pas demandé par l'utilisateur).
- **Scheduler** (`lib/scheduler.ts`) : `existing.step.frozen` reste lu (sera toujours `false` désormais, donc équivalent à supprimer la condition, mais on n'y touche pas pour éviter des effets de bord).
- Pages **Study / MaterialPurchases / ToolingPurchases / Subcontracting** : continuent à afficher `displayOrder` en lecture seule — inchangé.
- Type `Order.frozenOrder` et `Order.manualSortOrder`, type `ProductionStep.frozen` : **conservés** dans le type pour rester compatibles avec les données existantes en base, mais **plus jamais écrits ni lus** par l'UI des deux pages concernées. (Migration de nettoyage en DB non incluse — peut être faite plus tard.)

## Détails techniques

### `src/pages/OrdersPage.tsx`
- Retirer : `autoSortOrders`, `handleAutoSort`, bouton "Trier auto" (s'il existe), `unlockOrder`, `unlockAll`, `hasFrozenOrders`.
- Dans `handleDrop` et `applyMoveSelection` : retirer `frozenOrder: ... ? true : o.frozenOrder` de la map de réindexation.
- Dans la cellule "الترتيب" : supprimer le `Lock`/`WarningTriangleIcon` conditionnels, ne garder que `GripVertical` + numéro.
- Dans la cellule "عمليات" : supprimer le bouton `Unlock` conditionnel sur `o.frozenOrder`.
- Conserver l'effet de renumérotation 1..N (sanitization).
- Imports à nettoyer : `Lock`, `Unlock`, `WarningTriangleIcon` (si plus utilisé ailleurs dans le fichier — vérifier).

### `src/pages/PlanningTableauPage.tsx`
- Remplacer `insertNewStepsAtPriorityTop` par une fonction qui se contente d'ajouter les nouvelles étapes (sans Pn) en fin de liste de l'opérateur.
- Dans `operatorTasks` : tri **uniquement** par `planningOrderMap[step.id]` ; les étapes sans Pn vont à la fin dans l'ordre d'insertion.
- Effet d'auto-compactage : conserver une version simplifiée qui renumérote 1..N par opérateur si des trous apparaissent (suppression d'une étape), sans jamais ré-ordonner.
- Supprimer `handleAutoSort` + le bouton "Trier auto" dans l'entête de chaque tableau opérateur.
- Supprimer `toggleStepFrozen`, le bouton cadenas, `YellowLockIcon` dans la colonne "عمليات".
- Dans `applyReorder` : retirer l'écriture de `frozen: true`, retirer la mise à jour de `frozenOrder` / `manualSortOrder` sur les commandes.
- Dans `handleCompletionAnswer` (finished=true) : retirer `frozen: true`, conserver simplement le retrait via `isStepFinished`.
- Supprimer `forcedPhaseAmontWarnings`, `pendingDrop`, `handlePendingConfirm`, `handlePendingCancel`, `ConfirmDialog` chaîné associé, et toutes les variables `orderWarning/studyWarning/materialWarning/toolingWarning/phaseWarning` qui dépendaient de `step.frozen`. Le rendu affiche directement les pills/emojis sans le mode "forcé".
- `isManualOrderViolation` : devient inutile → supprimer.
- Le snapshot d'undo/redo n'a plus besoin de `forcedPhaseAmontWarnings` → simplifier `PlanningDraftSnapshot`.

### Vérifications de non-régression (avant suppression)
1. `frozen` sur step : seul Gantt et Scheduler le lisent en dehors des deux pages → OK, on n'y touche pas.
2. `frozenOrder` sur order : seul OrdersPage et PlanningTableauPage l'écrivent/lisent → suppression sans impact externe.
3. `manualSortOrder` : seul PlanningTableauPage l'écrit, personne ne le lit ailleurs → OK.
4. `displayOrder` : lu par StudyPage / MaterialPurchasesPage / ToolingPurchasesPage / Subcontracting / Gantt / OrdersPage → la sanitization 1..N est conservée, donc inchangé pour eux.
5. `planning_order` (DB) : continue à être écrit par D&D, lu par PlanningTableauPage → inchangé.

## Question

Veux-tu également supprimer l'effet de **renumérotation automatique 1..N** (sanitization) ? Si oui, les Cn et Pn pourraient devenir non contigus (1, 2, 5, 8…) après suppression d'une commande/étape. Par défaut je le **conserve** car il ne change pas l'ordre relatif, il évite juste les trous.
