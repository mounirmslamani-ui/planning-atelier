ALTER TABLE public.production_steps
  ADD COLUMN study_ready boolean NOT NULL DEFAULT true,
  ADD COLUMN material_available boolean NOT NULL DEFAULT true,
  ADD COLUMN tooling_available boolean NOT NULL DEFAULT true,
  ADD COLUMN study_deadline date,
  ADD COLUMN material_deadline date,
  ADD COLUMN tooling_deadline date;