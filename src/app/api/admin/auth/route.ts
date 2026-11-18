import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  ADMIN_COOKIE_NAME,
  getAdminFromRequest,
  hashPassword,
  signAdminToken,
  verifyPassword,
} from '@/lib/auth';

const LoginSchema = z.object({
  email: z.string().email('Email inválido').trim().toLowerCase(),
  password: z.string().min(4, 'Ingresa tu contraseña'),
});

async function ensureSeedAdminsIfEmpty() {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('admin_accounts')
    .select('*', { count: 'exact', head: true });

  if ((count ?? 0) === 0) {
    const defaultPass = process.env.ADMIN_INITIAL_PASSWORD || 'SaborGoo2026!';
    const passHash = hashPassword(defaultPass);

    const admin1Email = (process.env.ADMIN_1_EMAIL || 'socia1@saborgoo.uy').toLowerCase();
    const admin2Email = (process.env.ADMIN_2_EMAIL || 'socia2@saborgoo.uy').toLowerCase();
    const admin3Email = (process.env.ADMIN_3_EMAIL || 'admin@saborgoo.uy').toLowerCase();

    await supabase.from('admin_accounts').insert([
      {
        email: admin1Email,
        full_name: 'Socia 1 (Cocina & Reparto)',
        phone: '59899000001',
        role: 'admin_driver',
        password_hash: passHash,
      },
      {
        email: admin2Email,
        full_name: 'Socia 2 (Cocina & Reparto)',
        phone: '59899000002',
        role: 'admin_driver',
        password_hash: passHash,
      },
      {
        email: admin3Email,
        full_name: 'Dirección General Sabor Goo',
        phone: '59899000003',
        role: 'superadmin',
        password_hash: passHash,
      },
    ]);
  }
}

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, admin });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 400 });
    }

    await ensureSeedAdminsIfEmpty();

    const supabase = getSupabaseAdmin();
    const { data: account } = await supabase
      .from('admin_accounts')
      .select('*')
      .eq('email', parsed.data.email)
      .eq('is_active', true)
      .maybeSingle();

    if (!account || !verifyPassword(parsed.data.password, account.password_hash)) {
      return NextResponse.json(
        { error: 'Email o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const token = signAdminToken({
      id: account.id,
      email: account.email,
      fullName: account.full_name,
      role: account.role,
    });

    const response = NextResponse.json({
      authenticated: true,
      admin: {
        id: account.id,
        email: account.email,
        fullName: account.full_name,
        role: account.role,
      },
    });

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('POST /api/admin/auth error:', error);
    return NextResponse.json({ error: 'Error al iniciar sesión.' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
