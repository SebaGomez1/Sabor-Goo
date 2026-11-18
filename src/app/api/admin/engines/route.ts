import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { getMontevideoNow } from '@/lib/logistics';

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const emergencyForced =
      typeof body.emergency_mode_forced === 'boolean' ? body.emergency_mode_forced : undefined;

    const supabase = getSupabaseAdmin();
    const uyNow = getMontevideoNow();
    const isNightHours = uyNow.hour >= 20 || uyNow.hour <= 6;

    const updateFields: Record<string, unknown> = {
      engines_enabled: enabled,
      night_warmup_active: enabled && isNightHours,
      last_engine_run_at: enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (typeof emergencyForced === 'boolean') {
      updateFields.emergency_mode_forced = emergencyForced;
    }

    const { data: settings } = await supabase
      .from('app_settings')
      .update(updateFields)
      .eq('id', 1)
      .select('*')
      .single();

    if (enabled) {
      const modeLabel = isNightHours ? 'night_warmup' : 'normal';
      await supabase.from('engine_logs').insert({
        engine_name: 'Sistema Maestro 5 Motores',
        mode: modeLabel,
        action_summary: isNightHours
          ? `Encendido nocturno inmediato activado por ${admin.fullName}. Calentando cuentas y algoritmo durante la madrugada antes de la mañana.`
          : `Motores autónomos activados por ${admin.fullName} en horario operativo.`,
        metadata: { triggeredBy: admin.email, uruguayHour: uyNow.hour },
      });

      // Disparo inmediato de calentamiento si hay clave CRON_SECRET configurada
      const cronSecret = process.env.CRON_SECRET;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      if (cronSecret && baseUrl) {
        const cleanBase = baseUrl.replace(/\/$/, '');
        await Promise.allSettled([
          fetch(`${cleanBase}/api/media-brain/generate`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret, 'Content-Type': 'application/json' },
            body: JSON.stringify({ immediateWarmup: true }),
          }),
          fetch(`${cleanBase}/api/cron/engine-1-publisher`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret },
          }),
          fetch(`${cleanBase}/api/cron/engine-4-b2b`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret },
          }),
        ]);
      }
    } else {
      await supabase.from('engine_logs').insert({
        engine_name: 'Sistema Maestro 5 Motores',
        mode: 'paused',
        action_summary: `Motores autónomos pausados manualmente por ${admin.fullName}.`,
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('POST /api/admin/engines error:', error);
    return NextResponse.json({ error: 'Error controlando motores.' }, { status: 500 });
  }
}
