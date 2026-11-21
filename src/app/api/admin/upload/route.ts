import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';


export async function POST(req: NextRequest) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 });
  const supabase = getSupabaseAdmin();
  await supabase.storage.createBucket('menus', { public: true }).catch(() => null);
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `platos/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from('menus').upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: (error as any).message }, { status: 500 });
  const { data } = supabase.storage.from('menus').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
