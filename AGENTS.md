# Architecture rules
- Backup exports use an isolated read-only edge function with a fixed public-table catalog and server-side `is_admin` authorization; this prevents RLS filtering without exposing privileged credentials or arbitrary queries.
- Backup numeric columns are cast to text in the Data API before JSON parsing; this preserves database precision.