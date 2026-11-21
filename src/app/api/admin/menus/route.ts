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

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: menus, error } = await supabase
    .from('menus')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Error cargando menús.' }, { status: 500 });
  }

  return NextResponse.json({ menus: menus || [] });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = MenuSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.at(0)?.message || 'Datos de menú inválidos.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { id, ...fields } = parsed.data;

    if (id) {
      const { data: updated, error } = await supabase
        .from('menus')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json({ error: 'No se pudo actualizar el menú.' }, { status: 400 });
      }
      return NextResponse.json({ menu: updated });
    }

    const { data: created, error } = await supabase
      .from('menus')
      .insert(fields)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'No se pudo crear el menú.' }, { status: 400 });
    }

    return NextResponse.json({ menu: created });
  } catch (error) {
    console.error('POST /api/admin/menus error:', error);
    return NextResponse.json({ error: 'Error interno en menús.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Falta ID de menú.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.from('menus').delete().eq('id', id);
  return NextResponse.json({ deleted: true });
}
