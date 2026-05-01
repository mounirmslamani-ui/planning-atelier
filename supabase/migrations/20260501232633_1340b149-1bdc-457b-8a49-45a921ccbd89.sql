DO $$
DECLARE
  rec RECORD;
  last_operator uuid := NULL;
  cursor_ts timestamp := NULL;
  start_ts timestamp;
  end_ts timestamp;
  remaining integer;
  available integer;
BEGIN
  FOR rec IN
    WITH progress AS (
      SELECT step_id, bool_or(lower(coalesce(work_status, '')) = 'done') AS finished
      FROM public.production_records
      GROUP BY step_id
    )
    SELECT ps.id, ps.operator_id, ps.estimated_duration, ps.step_order, ps.start_date, ps.start_time, ps.end_date, ps.end_time
    FROM public.production_steps ps
    JOIN public.orders o ON o.id = ps.order_id
    LEFT JOIN public.operations op ON op.id = ps.operation_id
    LEFT JOIN progress pr ON pr.step_id = ps.id
    WHERE ps.operator_id IS NOT NULL
      AND ps.subcontractor_id IS NULL
      AND ps.start_date IS NOT NULL
      AND ps.end_date IS NOT NULL
      AND ps.estimated_duration > 0
      AND coalesce(pr.finished, false) = false
      AND o.order_number <> 'ABS'
      AND coalesce(op.name, '') <> 'Absence'
      AND ps.end_date < current_date
    ORDER BY ps.operator_id, ps.start_date, coalesce(ps.start_time, '08:00'::time), ps.step_order
  LOOP
    IF last_operator IS DISTINCT FROM rec.operator_id THEN
      last_operator := rec.operator_id;
      cursor_ts := current_date + time '08:00';
      WHILE extract(dow from cursor_ts) IN (5, 6)
         OR EXISTS (SELECT 1 FROM public.holidays h WHERE h.date = cursor_ts::date) LOOP
        cursor_ts := (cursor_ts::date + 1) + time '08:00';
      END LOOP;
    END IF;

    start_ts := cursor_ts;
    remaining := rec.estimated_duration;
    end_ts := start_ts;

    WHILE remaining > 0 LOOP
      WHILE extract(dow from end_ts) IN (5, 6)
         OR EXISTS (SELECT 1 FROM public.holidays h WHERE h.date = end_ts::date) LOOP
        end_ts := (end_ts::date + 1) + time '08:00';
      END LOOP;

      IF end_ts::time < time '08:00' THEN
        end_ts := end_ts::date + time '08:00';
      ELSIF end_ts::time >= time '12:00' AND end_ts::time < time '12:30' THEN
        end_ts := end_ts::date + time '12:30';
      ELSIF end_ts::time >= time '16:00' THEN
        end_ts := (end_ts::date + 1) + time '08:00';
        CONTINUE;
      END IF;

      IF end_ts::time < time '12:00' THEN
        available := floor(extract(epoch from ((end_ts::date + time '12:00') - end_ts)) / 60)::integer;
      ELSE
        available := floor(extract(epoch from ((end_ts::date + time '16:00') - end_ts)) / 60)::integer;
      END IF;

      IF remaining <= available THEN
        end_ts := end_ts + make_interval(mins => remaining);
        remaining := 0;
      ELSE
        remaining := remaining - available;
        IF end_ts::time < time '12:00' THEN
          end_ts := end_ts::date + time '12:30';
        ELSE
          end_ts := (end_ts::date + 1) + time '08:00';
        END IF;
      END IF;
    END LOOP;

    UPDATE public.production_steps
    SET start_date = start_ts::date,
        start_time = start_ts::time,
        end_date = end_ts::date,
        end_time = end_ts::time,
        updated_at = now()
    WHERE id = rec.id;

    cursor_ts := end_ts;
  END LOOP;
END $$;