import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function classify(code: string | undefined, message: string): string {
  if (code === 'PGRST002') return 'PGRST002';
  if (code === 'PGRST003') return 'PGRST003';
  if (code === '57014' || /timed out|timeout/i.test(message)) return 'timeout';
  if (/connection pool/i.test(message)) return 'PGRST003';
  return 'other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const logIncident = async (payload: {
    error_type: string;
    error_code?: string | null;
    error_message?: string | null;
    http_status: number;
    details?: Record<string, unknown>;
  }) => {
    try {
      await admin.from('health_incidents').insert({
        error_type: payload.error_type,
        error_code: payload.error_code ?? null,
        error_message: payload.error_message ?? null,
        http_status: payload.http_status,
        source: 'health-check',
        details: payload.details ?? {},
      });
    } catch (e) {
      console.error('failed to persist health incident', (e as Error).message);
    }
  };

  try {
    // Lightweight availability probe through the Data API (PostgREST + Postgres).
    const probe = admin.from('rights_catalog').select('id', { head: true, count: 'exact' });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('health probe timed out after 8000ms')), 8000),
    );

    const { error } = (await Promise.race([probe, timeout])) as { error: unknown };

    if (error) {
      const err = error as { code?: string; message?: string; hint?: string; details?: string };
      const message = err.message ?? 'unknown database error';
      const errorType = classify(err.code, message);
      console.error('health probe failed', JSON.stringify(err));
      await logIncident({
        error_type: errorType,
        error_code: err.code ?? null,
        error_message: message,
        http_status: 503,
        details: { hint: err.hint ?? null, details: err.details ?? null, latency_ms: Date.now() - startedAt },
      });
      return json(
        {
          status: 'unhealthy',
          error_type: errorType,
          message: 'Database/API unavailable',
          latency_ms: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        },
        503,
      );
    }

    return json(
      {
        status: 'ok',
        database: 'up',
        latency_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      200,
    );
  } catch (e) {
    const message = (e as Error).message ?? 'unknown error';
    const errorType = classify(undefined, message);
    console.error('health check exception', message);
    await logIncident({
      error_type: errorType,
      error_message: message,
      http_status: 503,
      details: { latency_ms: Date.now() - startedAt },
    });
    return json(
      {
        status: 'unhealthy',
        error_type: errorType,
        message,
        latency_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});
