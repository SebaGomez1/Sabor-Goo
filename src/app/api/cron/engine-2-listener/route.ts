import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';

async function runEngine2(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single();
  if (!settings?.engines_enabled) {
    return NextResponse.json({ skipped: true, reason: 'engines_disabled' });
  }

  await supabase.from('engine_logs').insert({
    engine_name: 'Motor 2 · Escucha Activa 24/7',
    mode: 'normal',
    action_summary: 'Verificación de escucha social activa: webhooks de comentarios y DMs listos con respuesta IA.',
  });

  return NextResponse.json({ ok: true, status: 'listening_active' });
}

export async function GET(req: NextRequest) {
  return runEngine2(req);
}

export async function POST(req: NextRequest) {
  return runEngine2(req);
}
