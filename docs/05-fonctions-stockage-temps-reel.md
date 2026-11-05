# 05 — Edge functions, stockage et temps réel

## 1. Edge functions (`supabase/functions/`)

6 fonctions sont déployées (le cahier initial en mentionnait 5 ; il en existe 6) :

| Fonction | Rôle | Accès sans connexion | Tables utilisées |
|---|---|---|---|
| `resolve-user-email` | Convertit le nom affiché saisi au login en e-mail de compte (réponse 404 « اسم المستخدم غير موجود » si inconnu) | **Oui** (`verify_jwt = false` dans `supabase/config.toml`) | `profiles` (+ auth) |
| `health` | Sonde de santé du backend ; consigne les incidents | **Oui** (`verify_jwt = false`) | `health_incidents` |
| `admin-create-user` | Création d'un compte (Auth + profil) par l'admin | Non (vérification admin côté serveur) | auth.users, `profiles` |
| `admin-reset-password` | Réinitialisation de mot de passe par l'admin | Non | auth.users, `profiles` |
| `admin-delete-user` | Suppression d'un compte par l'admin | Non | auth.users, `profiles` |
| `backup-export` | Export de sauvegarde complet, lecture seule, catalogue fixe de tables (`catalog.ts`), vérification `is_admin` côté serveur | Non (admin uniquement) | toutes les tables publiques (lecture) |

Notes :
- Seules `resolve-user-email` et `health` ont `verify_jwt = false` ; les autres exigent un JWT (comportement par défaut — à vérifier fonction par fonction si le réglage change).
- Les fonctions `admin-*` et `backup-export` font leur contrôle d'autorisation **côté serveur** : ne jamais déplacer ce contrôle dans le frontend.

## 2. Buckets de stockage

Les deux buckets sont **privés** : accès par URLs signées uniquement.

| Bucket | Contenu | Convention de chemin | Accès dans l'application |
|---|---|---|---|
| `order-attachments` | Pièces jointes des commandes (264 fichiers, ~40 Mo au 02/11/2026) | `{order_id}/{uuid}-{nom_fichier_assaini}` | `src/components/orders/OrderAttachmentsPanel.tsx`, `src/context/OrderAttachmentsContext.tsx` : upload via `storage.from('order-attachments').upload(path, file, { upsert: false })`, lecture via `createSignedUrl(file_path, 3600)` (liste) et `createSignedUrl(file_path, 120, { download })` (téléchargement), suppression `storage.remove([file_path])` + ligne `order_attachments` |
| `purchase-documents` | Justificatifs d'achats de matière (6 fichiers, ~707 ko au 02/11/2026) | `{purchase_id}/{uuid}-{nom_fichier_assaini}` | `src/hooks/usePurchaseDocuments.ts` : même mécanique d'URLs signées ; policies `storage.objects` conditionnées au droit n° 30 « أسعار شراء المواد الأولية » (migration 0011) |

- Les métadonnées des fichiers sont en table (`order_attachments`, `material_purchase_attachments`) : `file_path`, `file_name`, `file_type`, `file_size`, `uploaded_by`.
- Écart connu : 4 fichiers de `order-attachments` sans ligne en table (orphelins) — l'export de sauvegarde les inclut volontairement.

## 3. Temps réel (publication `supabase_realtime`)

Trois tables sont en publication temps réel :

- `orders`
- `production_steps`
- `production_records`

Ce sont les tables dont les changements doivent être visibles immédiatement sur les écrans de planning ouverts par plusieurs utilisateurs. Toute nouvelle table sensible devrait être ajoutée explicitement à la publication (à vérifier : procédure exacte selon l'outil de migration utilisé).

## 4. Export de sauvegarde

- Page « تصدير النسخة الاحتياطية » (`/backup-export`, `src/pages/BackupExportPage.tsx`), visible uniquement pour l'admin.
- Flux : la page appelle la fonction `backup-export` table par table (catalogue fixe dans `supabase/functions/backup-export/catalog.ts`), en paginant pour contourner la limite de 1000 lignes ; un récapitulatif compare le nombre exporté au nombre actuel en base ; les ZIP sont assemblés côté navigateur avec `jszip` (`src/lib/backupExport.ts`, tests dans `src/lib/backupExport.test.ts`).
- Garanties : lecture seule, numériques exportés en texte (précision préservée), NULL/JSONB/dates ISO avec fuseau conservés, chemins et noms de fichiers UTF-8, fichiers orphelins inclus.
- Règles d'architecture associées : voir `AGENTS.md` à la racine et docs/01 §12.
