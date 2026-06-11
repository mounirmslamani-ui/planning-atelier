
# Plan — Sessions utilisateurs planning-atelier

## État vérifié
- Les 2 comptes existent déjà dans `auth.users` :
  - `mounir.m.slamani@gmail.com` → UUID `7b57bae3-4916-4b91-8e14-19a8d199cd31`
  - `slamanitasnie@gmail.com` → UUID `8eb70f73-d009-46bc-9e66-e527716d2931`
- 13 tables métier ont toutes la même policy ouverte aux `authenticated` (`USING true`). **On garde ces policies telles quelles** — aucun risque pour la prod.
- AuthGate existe déjà (`src/components/AuthGate.tsx`) → la session Supabase et la page de login fonctionnent.
- `force_password_change` pour سلاماني تصنيع : le mot de passe actuel est conservé, seul le flag sera mis à `true`.

## Approche globale (hybride)
- RLS stricte uniquement sur les 3 nouvelles tables (`profiles`, `user_rights`, `audit_log`).
- Les 13 tables métier gardent leur policy actuelle (continuité de service totale).
- Le contrôle d'accès fonctionnel passe par **filtrage UI** côté React via un hook `useUserRights()` qui lit `user_rights` pour l'utilisateur courant et masque/désactive boutons & pages selon `denied / RO / RW / delegate`.

## Phase 1 — Base de données (migration unique)

### Tables créées
1. **`profiles`** : `id` (UUID, PK, FK → `auth.users(id)` ON DELETE CASCADE), `display_name` text, `role` text CHECK in (`'admin'`,`'user'`), `status` text CHECK in (`'active'`,`'suspended'`) défaut `'active'`, `force_password_change` boolean défaut false, `created_at` timestamptz défaut now().
2. **`user_rights`** : `id` UUID PK, `user_id` UUID FK → `profiles(id)` ON DELETE CASCADE, `tableau` text, `formulaire` text, `sous_formulaire` text, `champ_bouton` text, `niveau_acces` text CHECK in (`'RW'`,`'RO'`,`'delegate'`,`'denied'`). UNIQUE `(user_id, tableau, formulaire, sous_formulaire, champ_bouton)`.
3. **`audit_log`** : `id` UUID PK, `user_id` UUID, `action` text, `details` jsonb, `created_at` timestamptz défaut now().

### Fonction sécurité
- `public.is_admin(_uid uuid) returns boolean` (SECURITY DEFINER) lit `profiles.role = 'admin'` — utilisée dans les RLS pour éviter récursion.
- Trigger `prevent_multiple_admins` sur `profiles` (BEFORE INSERT/UPDATE) : refuse si une autre ligne avec `role='admin'` existe déjà.
- Trigger `populate_user_rights_on_new_profile` : à la création d'un profil (sauf admin), insère une ligne `denied` pour chacune des 20 lignes du référentiel (catalogue défini ci-dessous).

### Catalogue des 20 lignes de droits
Stocké en `INSERT` initial dans une table support `rights_catalog (id, ordre, tableau, formulaire, sous_formulaire, champ_bouton)` — sert de source pour générer les lignes manquantes lors de la création d'un nouvel utilisateur. (Inclut les 20 entrées listées dans le brief, dans l'ordre.)

### GRANTs et RLS
- `profiles` : `authenticated` SELECT/INSERT/UPDATE/DELETE ; `service_role` ALL. RLS :
  - SELECT : tout authentifié peut lire les profiles (nécessaire pour afficher noms côté UI).
  - INSERT/UPDATE/DELETE : admin uniquement (via `is_admin(auth.uid())`), sauf un cas spécial UPDATE où chacun peut mettre à jour `force_password_change=false` sur sa propre ligne.
- `user_rights` : RLS — SELECT pour authenticated ; INSERT/UPDATE/DELETE admin seulement.
- `audit_log` : INSERT pour authenticated ; SELECT admin seulement.
- `rights_catalog` : SELECT authenticated, ALL service_role.

### Seed des données
- Insert profile admin : id = `7b57bae3-4916-4b91-8e14-19a8d199cd31`, display_name `منير`, role `admin`, force_password_change false.
- Insert profile user : id = `8eb70f73-d009-46bc-9e66-e527716d2931`, display_name `سلاماني تصنيع`, role `user`, force_password_change **true**.
- Insert des 20 lignes de `user_rights` à `'RW'` pour سلاماني تصنيع.
- Aucune ligne `user_rights` pour منير (l'UI affichera `ADMIN` figé pour sa colonne).
- ⚠️ Tout en `INSERT ... ON CONFLICT DO NOTHING` pour idempotence.

## Phase 2 — Frontend

### Auth & contexte
- Nouveau `src/context/AuthContext.tsx` : expose `{ session, profile, rights, isAdmin, hasAccess(key) }`. Charge `profiles` + `user_rights` après login.
- Adaptation `AuthGate` : si session présente mais `profile.status='suspended'` → signOut + message arabe. Si `force_password_change=true` → écran obligatoire de changement mot de passe (call `supabase.auth.updateUser({password})` puis `profiles.update({force_password_change:false})`).
- Garde existante de la dernière page : déjà gérée par React Router (la page actuelle reste affichée après session restaurée).

### Inactivité 20 min
- Hook `useInactivityTimeout()` monté dans `AppLayout` : listeners `mousemove`, `keydown`, `click`, `scroll`, `touchstart`. À 18 min → modale `prolonger la session ?` (composant `SessionExpiryDialog`). À 20 min → `supabase.auth.signOut()`.

### Sidebar
- Bouton `تسجيل الخروج` : déjà présent dans `AppSidebar` (`خروج`). On le garde.
- Nouvelle rubrique `المستخدمون` (visible si `isAdmin`) → route `/users` → page `UsersAdminPage`.

### Page `UsersAdminPage`
- Section haute : boutons `إضافة مستخدم` / `إزالة مستخدم` / `تعليق مستخدم`.
- `إضافة مستخدم` : modale → appelle une **edge function** `admin-create-user` (verify_jwt désactivé, validation côté serveur que l'appelant est admin via JWT, utilise `SUPABASE_SERVICE_ROLE_KEY` pour `auth.admin.createUser`). Côté serveur : insère `profiles` + 20 lignes `user_rights` à `denied`. Journalise dans `audit_log`.
- `إزالة مستخدم` : edge function `admin-delete-user` (confirmation 2 étapes côté UI) → supprime `auth.users` (CASCADE → profiles → user_rights). Audit log.
- `تعليق مستخدم` : update `profiles.status='suspended'`. Audit log.
- Tableau droits : lignes = catalogue (20), colonnes = profiles ordonnés (منير en premier, figé `ADMIN`). Chaque cellule = `<select>` avec `RW / RO / بالنيابة / denied`. Sauvegarde live (upsert `user_rights`). Audit log par changement.

### Filtrage UI selon droits
- Helper `hasAccess(tableau, formulaire, sous_formulaire, champ_bouton)` retourne le niveau effectif.
- Application minimale en phase 1 : masquage de la rubrique `المستخدمون` pour non-admin et masquage/désactivation des actions critiques pour les non-admin selon les droits (ex. boutons `محو الطلبية`, `إلغاء الطلبية`, `ترتيب آلي`, accès aux rubriques المعدات/الزبائن/…).
- Mode `RO` : pages affichées en lecture seule (boutons d'édition désactivés).
- Mode `denied` : item de sidebar masqué + route renvoie vers `/` si accédée en URL directe.

## Phase 3 — Edge functions
- `admin-create-user` (service_role)
- `admin-delete-user` (service_role)
- Secret `SUPABASE_SERVICE_ROLE_KEY` déjà présent.

## Détails techniques

- Auth: pas de modification de `client.ts` ni `types.ts` (auto-gen).
- Tous les libellés UI en arabe RTL, design system existant respecté.
- Aucune modification des 13 tables métier ni de leurs policies → zéro risque de régression pour les 2 utilisateurs actuels.
- Migration **idempotente** : `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.
- Le mot de passe de سلاماني تصنيع n'est **pas** modifié (juste le flag `force_password_change=true`).

## Ordre d'exécution proposé
1. Migration DB (Phase 1) → tu valides.
2. Edge functions `admin-create-user` / `admin-delete-user`.
3. AuthContext + force-password-change + inactivity timeout.
4. Page `UsersAdminPage` + entrée sidebar admin.
5. Filtrage UI minimal des actions critiques.

## Hors scope (à confirmer plus tard)
- RLS granulaire au niveau des tables métier basée sur user_rights : pas dans cette phase (continuité de service). À planifier dans un chantier ultérieur si besoin réel.
