# 00 — Lisezmoi

## À quoi sert l'application

Application de gestion d'un **atelier d'usinage** (machine shop) : suivi des commandes clients, définition des étapes de production, ordonnancement (planning tableau + diagramme de Gantt), registre de production, contrôle qualité, livraisons, suivi de facturation, achats de matières premières, gestion des opérateurs, équipements, sous-traitants, absences et jours fériés.

**Utilisateurs et rôles** : un seul **administrateur** (tous droits, gestion des utilisateurs) et des **utilisateurs** aux droits accordés finement via le catalogue de 38 droits (voir docs/03). Comptes suspendables sans suppression.

**Langues** : interface bilingue arabe / français. L'interface est principalement en **arabe, sens de lecture droite-à-gauche** (`<html lang="ar" dir="rtl">` dans `index.html`) ; la documentation et une partie des libellés techniques sont en français. Les libellés arabes de l'interface sont repris tels quels dans toute la documentation.

## Pile technique

- **Frontend** : React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui (Radix UI), TanStack Query, react-router-dom 6, react-hook-form + zod, recharts, xlsx (exports Excel), jszip (exports de sauvegarde), vitest + Testing Library (tests).
- **Backend** : Lovable Cloud (Supabase managé) — base PostgreSQL avec RLS, Auth, Storage, Edge Functions (Deno), Realtime.
- **Migrations** : deux séries historiques — `supabase/migrations/` (67 fichiers) puis `drizzle/migrations/` (0000 → 0011, drizzle-kit + `postgres.js`, appliquées via la variable `LOVABLE_DB_MIGRATION_URL`).

## Lancer le projet en local

```bash
npm install
npm run dev        # http://localhost:8080
npm run test       # vitest
npm run build      # build de production
```

**Variables d'environnement** (fichier `.env`, généré automatiquement — ne pas éditer à la main dans Lovable) :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (clé anon/publiable)
- `VITE_SUPABASE_PROJECT_ID`

Hors Lovable, il faut fournir ces trois variables (projet Supabase ou compatible) et recréer la base via les migrations (voir docs/01 §11 pour les écarts connus entre fichiers de migrations et état réel).

## Dépendances à la plateforme Lovable (à remplacer pour s'en passer)

| Élément | Fichier / emplacement | Rôle | Remplacement hors Lovable |
|---|---|---|---|
| `lovable-tagger` | `vite.config.ts` (plugin `componentTagger()`, dev uniquement) | Balisage des composants pour l'éditeur visuel | Supprimer le plugin : aucun impact fonctionnel |
| `previewAuthStorage.ts` | `src/integrations/supabase/` (généré) | Partage de la session Auth entre les aperçus de l'éditeur via `postMessage` ; retombe sur `localStorage` hors éditeur | Remplacer par le storage `localStorage` standard de supabase-js |
| `client.ts`, `types.ts` | `src/integrations/supabase/` (générés) | Client Supabase initialisé + types de la base | Régénérer avec `supabase gen types` / créer le client à la main |
| `.env` | racine (généré) | Variables `VITE_SUPABASE_*` | Fournir ses propres variables |
| `supabase/config.toml` | racine `supabase/` (généré) | `project_id`, réglages des fonctions (`verify_jwt`) | Recréer pour son propre projet |
| Balises Lovable | `index.html` | Titre « Lovable App », méta og/twitter pointant sur lovable.dev | Personnaliser (titre, description, og:image) — de toute façon à faire, voir docs/01 §13 |
| `LOVABLE_DB_MIGRATION_URL` | environnement sandbox | Chaîne de connexion PostgreSQL directe utilisée pour appliquer les migrations drizzle | Utiliser la chaîne de connexion de sa propre base |
| Backend managé | Lovable Cloud (réf. projet `lfrpifycckvqheqntmql`) | Base, Auth, Storage, Edge Functions, Realtime | Projet Supabase auto-hébergé ou managé équivalent |

## Structure du dépôt (repères)

- `src/pages/` : pages (AuthPage, BackupExportPage, MaterialReferencesPage…)
- `src/lib/` : logique métier (PlanningTableauPage, OrdersPage, StepsPage, ProductionRegisterPage, dialogues, `supabase-data.ts` = couche d'accès aux données + `fetchAllPaginated` + `toISODate`)
- `src/context/` : état global (PlanningContext, OrderAttachmentsContext)
- `src/hooks/` : hooks (useMaterialReferences, usePurchaseDocuments…)
- `supabase/functions/` : 6 edge functions (voir docs/05)
- `supabase/migrations/` et `drizzle/migrations/` : historiques de migrations (voir docs/01 §11)
- `docs/` : cette documentation

## Documentation associée

- `docs/01-pieges-et-decisions.md` — pièges, décisions, dette technique (à lire en premier avant toute modification)
- `docs/02-regles-metier.md` — règles de gestion de l'atelier
- `docs/03-droits-et-acces.md` — système de droits (RBAC)
- `docs/04-modele-de-donnees.md` — tables, vues, enums
- `docs/05-fonctions-stockage-temps-reel.md` — edge functions, buckets, realtime, sauvegarde
- `docs/06-connaissance-projet-lovable.md` — instructions personnalisées du projet
- `AGENTS.md` — règles d'architecture (export de sauvegarde)
- Audit brut de la base : `db_audit_2026-11-02.zip` (dossier Files de l'utilisateur)
