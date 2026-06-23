# Follow-up — Scoping production_records dans PlanningContext

**Créé le :** 23/06/2026
**Échéance cible :** dans le mois suivant (à traiter bien avant que `production_records` n'approche 10 000 lignes — projection ~13 mois).
**Priorité :** moyenne (correctif préventif, pas urgent tant que la table reste < ~5 000 lignes).

## Contexte

Le correctif PostgREST 1000-row livré le 23/06/2026 dans `src/lib/supabase-data.ts` :
- Filtre `orders` au scope actif (~282 lignes).
- Pose un plafond `.range(0, 9999)` sur `production_records`, `production_steps`, `quality_control_entries`, `delivery_entries`.
- Pose `.range(0, 49999)` sur `delivered_orders` et `cancelled_orders` (sets d'exclusion).

Ce n'est qu'un report du problème pour `production_records`, qui croît le plus vite (1019 lignes après ~1 an).

## Travail à faire

### 1. Découpler ProductionRegisterPage du contexte global
- Aujourd'hui `ProductionRegisterPage` lit `productionRecords` depuis `PlanningContext` (il a besoin de l'historique complet, y compris commandes livrées/annulées).
- À refactorer pour qu'elle fetch sa propre donnée `production_records` via un hook local :
  - Soit pagination serveur (`.range(from, to)` + `count: 'exact'` + UI page navigator).
  - Soit `.range(0, 49999)` dédié à cette page (équivalent du traitement appliqué à delivered/cancelled).
- Vérifier qu'aucun autre composant ne dépend de l'historique complet via le contexte global.

### 2. Scoper production_records dans PlanningContext
Une fois l'étape 1 faite :
- Dans `fetchAllData()`, restreindre `production_records` aux `order_id` des commandes actives uniquement (~475 records estimés).
- Format : `.in('order_id', activeOrderIds)` après avoir construit la liste à l'étape 1 du fetch.
- Idem possible pour `production_steps`, `quality_control_entries`, `delivery_entries` (à valider au cas par cas).

## Critère de validation
- `سجل الأعمال المنجزة` continue d'afficher 100 % de l'historique (y compris commandes livrées/annulées).
- Le contexte global ne charge plus que les records des commandes actives.
- Aucune régression sur Gantt, planning tableau, suivi des étapes, مراقبة الجودة.
