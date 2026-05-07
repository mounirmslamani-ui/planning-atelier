
-- Restore historical completed steps for order 26/155
-- Salah Tournage (validated 2026-05-05 15:54 UTC, 180 min)
INSERT INTO public.production_steps (
  id, order_id, operator_id, operation_id, estimated_duration,
  start_date, start_time, end_date, end_time, step_order, frozen
) VALUES (
  '96ce4442-b5e3-42a6-b761-23e5f95c8a62',
  '706d36eb-f75a-4706-bb16-ec56190e5333',
  'f8d5b99e-9044-44b2-a3fc-d98f94eb2d75',
  'a2da5e04-7c52-4dfb-8be8-fb52289e7bb2',
  180,
  '2026-05-05', '13:54:00', '2026-05-05', '16:54:00', 1, true
) ON CONFLICT (id) DO NOTHING;

-- Hamza Fraisage (validated 2026-05-06 14:54 UTC, 80 min)
INSERT INTO public.production_steps (
  id, order_id, operator_id, operation_id, estimated_duration,
  start_date, start_time, end_date, end_time, step_order, frozen
) VALUES (
  '6e48d894-d969-40d9-ac18-084adb60ac2e',
  '706d36eb-f75a-4706-bb16-ec56190e5333',
  '32a8a296-65d7-477a-9e3b-79d982a9e6a0',
  'b7083757-7cbe-4ee5-b3d6-37e9364c3c3f',
  80,
  '2026-05-06', '14:34:00', '2026-05-06', '15:54:00', 2, true
) ON CONFLICT (id) DO NOTHING;

-- Push existing Mahmoud steps after the restored ones
UPDATE public.production_steps
SET step_order = step_order + 2
WHERE order_id = '706d36eb-f75a-4706-bb16-ec56190e5333'
  AND id NOT IN ('96ce4442-b5e3-42a6-b761-23e5f95c8a62','6e48d894-d969-40d9-ac18-084adb60ac2e');
