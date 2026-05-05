DELETE FROM public.production_records;
DELETE FROM public.production_steps;
DELETE FROM public.quality_control_entries;
DELETE FROM public.delivery_entries;
DELETE FROM public.delivered_orders;
DELETE FROM public.cancelled_orders;
DELETE FROM public.orders WHERE order_number <> 'ABSENCE-PLACEHOLDER';