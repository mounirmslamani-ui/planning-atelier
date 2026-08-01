CREATE TABLE public.health_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  error_type text NOT NULL DEFAULT 'other',
  error_code text,
  error_message text,
  http_status integer,
  source text NOT NULL DEFAULT 'health-check',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.health_incidents TO service_role;
GRANT SELECT ON public.health_incidents TO authenticated;

ALTER TABLE public.health_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_incidents_select_admin"
ON public.health_incidents
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_health_incidents_occurred_at ON public.health_incidents (occurred_at DESC);
CREATE INDEX idx_health_incidents_error_type ON public.health_incidents (error_type);