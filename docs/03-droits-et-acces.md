# 03 — Droits et accès (RBAC)

## 1. Vue d'ensemble

- Authentification par e-mail + mot de passe (Supabase Auth), mais l'utilisateur saisit son **nom affiché** (`profiles.display_name`) : la fonction `resolve-user-email` le convertit en e-mail avant `signInWithPassword`.
- Autorisation applicative basée sur un catalogue de droits (`rights_catalog`) accordés par utilisateur (`user_rights`) avec un niveau d'accès (`niveau_acces` : RW / RO / delegate).
- Application en base : policies RLS + triggers `enforce_rbac_orders` et `enforce_rbac_production_steps` (migration du 03/08/2026). Fonctions `security definer` : `can_read`, `can_write`, `can_read_commercial`, `is_admin`.

## 2. Catalogue des droits (`rights_catalog`, 38 entrées)

Clé fonctionnelle d'un droit = quadruplet (tableau, formulaire, sous-formulaire, champ/bouton). `is_confidential = true` ⇒ non accordé automatiquement à la création d'un profil (migration 0003).

| # | Tableau | Formulaire | Sous-formulaire | Champ/Bouton | Libellé FR | Confidentiel |
|---|---|---|---|---|---|---|
| 1 | سجل الطلبيات | | | طلبية جديدة | Créer une nouvelle commande | non |
| 2 | Tous | بطاقة متابعة إنجاز الطلبية | معلومات الطلبية والزبون | Tous | Renseigner infos commande & client | non |
| 3 | | | تحضير الطلبية والموارد | المواد الأولية | Renseigner les besoins en matière première | non |
| 4 | | | تحضير الطلبية والموارد | العدة | Renseigner les besoins en outillage | non |
| 5 | | | تحضير الطلبية والموارد | الدراسة | Renseigner l'état de l'étude | non |
| 6 | | | مراحل الإنجاز والتوقيت | Tous | Renseigner les étapes de réalisation & délais | non |
| 7 | | | مراقبة الجودة والتسليم | سجل مراقبة الجودة | Renseigner le contrôle qualité | non |
| 8 | | | | التسليم | Renseigner la livraison | non |
| 9 | | | | إلغاء الطلبية | Annuler une commande | non |
| 10 | | | | محو الطلبية | Supprimer définitivement une commande | non |
| 11 | تسيير الطلبيات الجارية | | تغيير ترتيب الطلبيات | | Réordonner les commandes en cours | non |
| 12 | جدول البرمجة | | تغيير ترتيب الطلبيات في البرمجة | | Réordonner les commandes dans le planning | non |
| 13 | | بداية / تبديل / نهاية الدوام | | | Gérer début / relais / fin de poste | non |
| 14 | | | | ترتيب آلي | Lancer l'ordonnancement automatique | non |
| 15 | المستخدمون | إضافة / إزالة / تعليق مستخدم | | | Gérer les utilisateurs | non |
| 16 | العمال | | | | Gérer les opérateurs | non |
| 17 | الغيابات | | | | Gérer les absences | non |
| 18 | العطل الرسمية | | | | Gérer les jours fériés | non |
| 19 | الزبائن | | | | Gérer les clients | non |
| 20 | المناولون | | | | Gérer les sous-traitants | non |
| 21 | العمليات | | | | Gérer les opérations | non |
| 22 | | | | إعادة إدماج | Réintégrer une commande annulée | non |
| 23 | | | | إقفال مراقبة الجودة يدوياً | Clôturer manuellement le contrôle qualité | non |
| 24 | | | | إقفال التسليم يدوياً | Clôturer manuellement la livraison | non |
| 25 | | | | حذف جلسة | Supprimer une session QC ou livraison | non |
| 26 | سجل الأعمال المنجزة | | | تعديل التسجيل | Modifier un enregistrement du registre de production | non |
| 27 | سجل الأعمال المنجزة | | | حذف التسجيل | Supprimer un enregistrement du registre de production | non |
| 28 | | | حساب التكلفة/ثمن البيع | Tous | Calcul du coût / prix de vente | non |
| 29 | مرجعيات المادة الأولية | | | | Référentiels matière première (nuances, formats, dimensions, unités, masses volumiques, fournisseurs) | non |
| 30 | أسعار شراء المواد الأولية | | | | Prix d'achat matières | **oui** |
| 31 | متابعة فوترة الطلبيات | | | | Suivi de facturation des commandes | **oui** |
| 32 | سندات الطلب | | | | Bons de commande fournisseur | non |
| 33 | وصولات الاستلام | | | | Bons de réception | non |
| 34 | وصولات التسليم | | | | Bons de livraison | non |
| 35 | الفواتير | | | | Factures | **oui** |
| 36 | فواتير الاسترجاع | | | | Factures d'avoir | **oui** |
| 37 | التسديدات | | | | Règlements | **oui** |
| 38 | معلومات الشركة | | | | Informations de l'entreprise | **oui** |

## 3. Tables et fonctions

- **`user_rights`** : (user_id → profiles, tableau, formulaire, sous_formulaire, champ_bouton, niveau_acces). Niveaux : RW (lecture-écriture), RO (lecture seule), delegate (délégation — sémantique exacte à vérifier dans les triggers).
- **`can_read(uid, tableau, formulaire, sous_formulaire, champ_bouton)`** / **`can_write(...)`** : `security definer`, renvoient vrai si l'utilisateur est admin (court-circuit) ou possède le droit au niveau requis.
- **`can_read_commercial(uid)`** : accès en lecture aux données commerciales.
- **`is_admin(uid)`** : vrai si `profiles.role = 'admin'` (et compte actif).
- **`populate_user_rights_on_new_profile`** (trigger) : à la création d'un profil, accorde automatiquement les droits **non confidentiels**.
- **`prevent_multiple_admins`** (trigger) : un **seul** administrateur dans toute l'application.
- **`enforce_rbac_orders`** / **`enforce_rbac_production_steps`** (triggers) : appliquent les droits en base sur les commandes et les étapes.

## 4. Comptes et statuts

- `profiles` : display_name, role (`admin` / `user`), status (`active` / `suspended`), `force_password_change`.
- Un compte **suspendu** ne peut pas se connecter (à vérifier : point exact du blocage — fonction `resolve-user-email` ou policy).
- Comptes existants (audit du 02/11/2026) : منير (admin, actif) ; حكيم, سلاماني تصنيع (actifs) ; ريمة, ليليا (suspendus).

## 5. Parcours de connexion

1. `src/pages/AuthPage.tsx` : saisie du **nom affiché** + mot de passe.
2. Appel de la fonction edge `resolve-user-email` (accès **sans connexion**, `verify_jwt = false` dans `supabase/config.toml`) avec `display_name` → renvoie l'e-mail du compte, ou 404 « اسم المستخدم غير موجود ».
3. `supabase.auth.signInWithPassword({ email, password })`.
4. Si `force_password_change` : changement de mot de passe obligatoire (parcours à vérifier dans le code).

## 6. Création et gestion des utilisateurs (par l'admin)

- Fonctions edge réservées à l'admin (vérification côté serveur) :
  - `admin-create-user` : crée le compte Auth + le profil (le trigger `populate_user_rights_on_new_profile` accorde alors les droits non confidentiels).
  - `admin-reset-password` : réinitialise un mot de passe.
  - `admin-delete-user` : supprime un compte.
- Page « المستخدمون » (droit n° 15) : ajout, suspension, suppression, et gestion des droits par utilisateur.

## 7. Mode observation du relais de poste

Le bloc « بداية / تبديل / نهاية الدوام » (droit n° 13, colonnes `shift_started_date` / `shift_ended_date` de `production_steps`) est en **observation seule** : pas de blocage, seulement une trace `SHADOW_RBAC_WOULD_BLOCK` dans `audit_log`. Voir docs/01 §9 pour la requête de revue et la décision en attente.
