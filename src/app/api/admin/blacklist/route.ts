import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { normalizeUruguayPhone } from '@/lib/whatsapp';

const BlacklistSchema = z.object({
  phone: z.string().min(7, 'Celular inválido').max(25),
  customer_name: z.string().min(2, 'Nombre requerido').max(80),
  reference_address: z.string().min(2, 'Dirección de referencia requerida').max(180),
  reason: z.string().min(3, 'Motivo requerido').max(250),
});

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('blacklist')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = BlacklistSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.at(0)?.message || 'Datos inválidos.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const phone = normalizeUruguayPhone(parsed.data.phone);
    const supabase = getSupabaseAdmin();

    const { data: entry, error } = await supabase
      .from('blacklist')
      .upsert(
        {
          phone,
          customer_name: parsed.data.customer_name,
          reference_address: parsed.data.reference_address,
          reason: parsed.data.reason,
          blocked_by_admin: admin.email,
          is_blocked: true,
        },
        { onConflict: 'phone' }
      )
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'No se pudo agregar a lista negra.' }, { status: 400 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('POST /api/admin/blacklist error:', error);
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json();
  const { id, is_blocked } = body;
  if (!id || typeof is_blocked !== 'boolean') {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.from('blacklist').update({ is_blocked }).eq('id', id);
  return NextResponse.json({ updated: true });
}
