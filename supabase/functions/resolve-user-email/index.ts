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
    console.log('env check', { hasUrl: !!SUPABASE_URL, hasService: !!SERVICE, serviceLen: SERVICE?.length ?? 0 });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const trimmed = display_name.trim();
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('id, status')
      .ilike('display_name', trimmed)
      .maybeSingle();

    if (profErr) {
      console.error('profiles query error', JSON.stringify(profErr));
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
