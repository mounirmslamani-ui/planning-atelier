-- Cleanup: remove stale QC entry that blocks order 26/155 after reintegration.
-- Caused by the previous step-progress fallback that wrongly marked new
-- corrective steps as "Terminée" and auto-transferred the order back to QC.
DELETE FROM public.quality_control_entries
WHERE order_id = '706d36eb-f75a-4706-bb16-ec56190e5333';