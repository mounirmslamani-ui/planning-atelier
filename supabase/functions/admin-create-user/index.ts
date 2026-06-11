import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const callerId = claims.claims.sub;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: callerProfile } = await admin.from('profiles').select('role,status').eq('id', callerId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { email, password, display_name } = body as { email?: string; password?: string; display_name?: string };
    if (!email || !password || !display_name) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Le mot de passe doit comporter au moins 6 caractères' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || 'Création échouée' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const newId = created.user.id;
    const { error: profileErr } = await admin.from('profiles').insert({
      id: newId,
      display_name,
      role: 'user',
      status: 'active',
      force_password_change: true,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(newId);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await admin.from('audit_log').insert({
      user_id: callerId,
      action: 'create_user',
      details: { new_user_id: newId, email, display_name },
    });

    return new Response(JSON.stringify({ ok: true, user_id: newId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
