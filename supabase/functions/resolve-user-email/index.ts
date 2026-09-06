import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { display_name } = body as { display_name?: string };
    if (!display_name || typeof display_name !== 'string') {
      return new Response(JSON.stringify({ error: 'display_name requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    console.log('env check', { hasUrl: !!SUPABASE_URL, hasService: !!SERVICE });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const trimmed = display_name.trim();

    // Le backend peut renvoyer une erreur transitoire (redémarrage, timeout amont) :
    // on retente jusqu'à 3 fois avec un court délai, avec un timeout court par tentative.
    let profile: { id: string; status: string } | null = null;
    let profErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await admin
        .from('profiles')
        .select('id, status')
        .ilike('display_name', trimmed)
        .abortSignal(AbortSignal.timeout(8000))
        .maybeSingle();
      if (!res.error) {
        profile = (res.data as { id: string; status: string } | null) ?? null;
        profErr = null;
        break;
      }
      profErr = res.error;
      console.error(`profiles query error (tentative ${attempt})`, JSON.stringify(res.error));
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    if (profErr) {
      return new Response(JSON.stringify({ error: 'الخدمة غير متوفرة مؤقتا' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile) {
      console.warn('profile not found for', trimmed);
      return new Response(JSON.stringify({ error: 'اسم المستخدم غير موجود' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(profile.id);
    if (userErr || !userRes?.user?.email) {
      return new Response(JSON.stringify({ error: 'حساب غير صالح' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ email: userRes.user.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
