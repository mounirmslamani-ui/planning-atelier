import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { buckets, selections } from './catalog.ts';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('catalog') }).strict(),
  z.object({ action: z.literal('table'), table: z.string(), offset: z.number().int().min(0).max(100000000) }).strict(),
  z.object({ action: z.literal('count'), table: z.string() }).strict(),
  z.object({ action: z.literal('files'), bucket: z.enum(buckets), prefix: z.string().max(2048), offset: z.number().int().min(0) }).strict(),
]);

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respond({ error: 'طلب غير مسموح' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return respond({ error: 'الخدمة غير متوفرة مؤقتاً' }, 503);
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return respond({ error: 'يجب تسجيل الدخول' }, 401);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return respond({ error: 'يجب تسجيل الدخول' }, 401);
    const { data: isAdmin, error: roleError } = await admin.rpc('is_admin', { _uid: auth.user.id });
    if (roleError) return respond({ error: 'تعذر التحقق من الصلاحيات' }, 503);
    if (isAdmin !== true) return respond({ error: 'هذه الصفحة محجوزة للمسؤول فقط' }, 403);
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return respond({ error: 'طلب غير صالح' }, 400);
    const body = parsed.data;
    if (body.action === 'catalog') return respond({ tables: Object.keys(selections).sort(), buckets });
    if (body.action === 'table' || body.action === 'count') {
      const selection = Object.hasOwn(selections, body.table) ? selections[body.table] : undefined;
      if (!selection) return respond({ error: 'جدول غير مسموح' }, 400);
      if (body.action === 'count') {
        const { count, error } = await admin.from(body.table).select('id', { count: 'exact', head: true });
        if (error || count === null) return respond({ error: 'تعذر قراءة عدد السجلات' }, 500);
        return respond({ count });
      }
      // Each request is exactly one deterministic 1000-row page. Numeric casts happen in PostgreSQL.
      const { data, count, error } = await admin.from(body.table).select(selection, { count: 'exact' })
        .order('id', { ascending: true }).range(body.offset, body.offset + 999);
      if (error || !data || count === null) return respond({ error: 'تعذر تصدير الجدول' }, 500);
      return respond({ rows: data, count });
    }
    if (body.prefix.includes('..') || body.prefix.startsWith('/')) return respond({ error: 'مسار غير صالح' }, 400);
    const store = admin.storage.from(body.bucket);
    const { data, error } = await store.list(body.prefix, { limit: 1000, offset: body.offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) return respond({ error: 'تعذر قراءة قائمة الملفات' }, 500);
    const folders = data.filter(item => !item.id).map(item => body.prefix ? `${body.prefix}/${item.name}` : item.name);
    const files = data.filter(item => item.id).map(item => ({
      path: body.prefix ? `${body.prefix}/${item.name}` : item.name,
      size: item.metadata?.size ?? null, mime: item.metadata?.mimetype ?? null, created_at: item.created_at,
    }));
    const signed = files.length ? await store.createSignedUrls(files.map(file => file.path), 3600) : { data: [], error: null };
    return respond({ folders, files: files.map((file, i) => ({ ...file, url: signed.data?.[i]?.signedUrl ?? null })), hasMore: data.length === 1000 });
  } catch {
    return respond({ error: 'تعذر إكمال التصدير، حاول مجدداً' }, 500);
  }
});