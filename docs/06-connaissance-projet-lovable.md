# 06 — Connaissance du projet Lovable (instructions personnalisées)

J'ai accès aux instructions personnalisées du projet. Les voici, recopiées mot pour mot :

---

# Architecture rules
- Backup exports use an isolated read-only edge function with a fixed public-table catalog and server-side `is_admin` authorization; this prevents RLS filtering without exposing privileged credentials or arbitrary queries.
- Backup numeric columns are cast to text in the Data API before JSON parsing; this preserves database precision.

---

Ces deux règles sont également présentes dans le fichier `AGENTS.md` à la racine du dépôt (même contenu).
