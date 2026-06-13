# Plan d'implémentation RBAC

## Zones A & B — déjà en place (rien à faire)

- A : `canReorderCn` dans `OrdersPage.tsx` lit `sous_formulaire='تغيير ترتيب الطلبيات'` (ordre 11) et désactive D&D + items du menu contextuel.
- B : `canReorderPn` dans `PlanningTableauPage.tsx` lit `sous_formulaire='تغيير ترتيب الطلبيات في البرمجة'` (ordre 12). Confirmé « garder existant ».

## Zone C — Verrouillage des sous-formulaires de la بطاقة

### Mapping droit → sous-formulaire (rights_catalog existants)

| Sous-formulaire UI                                | tableau | formulaire | sous_formulaire                         | champ_bouton            |
|---------------------------------------------------|---------|------------|-----------------------------------------|-------------------------|
| Onglet معلومات الطلب والزبون                      | Tous    | بطاقة…     | معلومات الطلب والزبون                   | Tous                    |
| Section المواد الأولية (onglet موارد)             |         |            | تحضير الطلبية والموارد                  | المواد الأولية          |
| Section العدة                                     |         |            | تحضير الطلبية والموارد                  | العدة                   |
| Section الدراسة                                   |         |            | تحضير الطلبية والموارد                  | الدراسة                 |
| Onglet مراحل الإنجاز والتوقيت                     |         |            | مراحل الإنجاز والتوقيت                  | Tous                    |
| Bloc سجل مراقبة الجودة (PartialQCDelivery)        |         |            | مراقبة الجودة والتسليم                  | سجل مراقبة الجودة       |
| Bloc التسليم (PartialQCDelivery)                  |         |            |                                         | التسليم                 |

### Pattern à appliquer à chaque sous-formulaire

1. État local `locked: boolean` (initial = `true`).
2. Tant que `locked === true` :
   - Tous les `<Input>/<Select>/<Textarea>` reçoivent `disabled` / `readOnly`.
   - Les boutons internes (تأكيد، إلغاء، حفظ، أزرار d'action) sont `disabled`.
3. Bouton **تعديل** placé sur la même ligne horizontale que تأكيد/إلغاء :
   - Visible **uniquement** si `hasAccess(...) === 'RW'`.
   - Au clic : `locked = false`, change de variant (ex. `default` → `secondary`) pour signaler l'édition.
4. Bouton **إلغاء** : restaure le draft initial puis `locked = true`.
5. Bouton **تأكيد / حفظ** : sauvegarde puis `locked = true`.
6. Après chaque sauvegarde réussie (`useEffect` sur snapshot serveur) : `locked = true`.

### Composant utilitaire

Créer `src/components/orders/SubFormLockProvider.tsx` exposant :
- `useSubFormLock(canEdit: boolean)` → `{ locked, beginEdit, finishEdit, EditButton }`.

Évite la duplication dans 7 sous-formulaires.

### Fichiers à modifier

1. **`src/components/OrderUnifiedSheet.tsx`** — wrap chacun des onglets info/steps avec son lock. Pour l'onglet resources, 3 locks indépendants (un par section ressource dans `ResourcesEditorTable` ou wrapper local). Pour l'onglet qc, déléguer à PartialQCDelivery.
2. **`src/components/planning/PlanningEditor.tsx`** — `ResourcesEditorTable` doit accepter `lockedMap: { material, tooling, study }` et désactiver les contrôles par section ; `StepsEditorTable` accepte `locked: boolean`.
3. **`src/components/orders/PartialQCDelivery.tsx`** — deux locks séparés (QC et livraison) avec leur propre bouton تعديل ; les `hasAccess()` existants pour les actions internes (سجل مراقبة الجودة، التسليم، إقفال…، حذف جلسة) restent en place et ne s'activent que si lock = false ET droit RW.

### Comportement de fallback

- `RO` → bouton تعديل masqué, sous-formulaire reste verrouillé en lecture seule (l'utilisateur peut voir, pas modifier).
- `denied` → identique à `RO` côté verrouillage. La visibilité globale (afficher/masquer tout l'onglet) n'est pas dans le scope de cette demande — seul le verrou compte.

## Hors-scope confirmé

- Aucune nouvelle ligne `rights_catalog` (l'utilisateur a confirmé « existent déjà »).
- Pas de changement des libellés/labels existants.
- Pas de refonte de la logique métier (sauvegarde, validation, etc.).
