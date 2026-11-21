import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

const MenuSchema = z.object({
  id: z.string().uuid().optional(),
  day_of_week: z.number().int().min(1).max(5),
  day_label: z.string().min(3).max(20),
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(500),
  abundance_badge: z.string().optional().default('Porción Abundante Casera · Sin Escatimar'),
  category: z.enum(['menu_diario', 'hamburguesa']),
  price_uyu: z.number().int().min(50).max(5000),
  ingredient_cost_uyu: z.number().int().min(0).max(5000),
  image_url: z.string().min(1),
  daily_stock: z.number().int().min(0).max(500),
  is_active: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });
  const sb = getSupabaseAdmin();
  await sb.storage.createBucket('menus', { public: true }).catch(() => null);
  const ext = file.name.split('.').pop() || 'jpg';
  const path = 'platos/' + Date.now() + '.' + ext;
  const { error } = await sb.storage.from('menus').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: sb.storage.from('menus').getPublicUrl(path).data.publicUrl });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}