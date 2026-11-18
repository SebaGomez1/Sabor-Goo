import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';
import { getMontevideoNow } from '@/lib/logistics';

async function handleEngine1(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single();

  if (!settings?.engines_enabled) {
    return NextResponse.json({ skipped: true, reason: 'engines_disabled' });
  }

  // Jitter seguro anti-baneo (1.5 a 4.5 segundos)
  const jitterMs = 1500 + Math.floor(Math.random() * 3000);
  await new Promise((r) => setTimeout(r, jitterMs));

  const uyNow = getMontevideoNow();
  const isNightWarmup = uyNow.hour >= 20 || uyNow.hour <= 6;

  // Verificar si estamos en Modo Emergencia (13:00 a 21:00 hs UY sin alcanzar meta diaria)
  const { count: todayOrdersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('delivery_date', uyNow.isoDate)
    .in('order_status', ['confirmed', 'preparing', 'on_the_way', 'delivered']);

  const isEmergency =
    settings.emergency_mode_forced ||
    (uyNow.hour >= 13 &&
      uyNow.hour < 21 &&
      (todayOrdersCount ?? 0) < (settings.daily_order_goal || 35));

  const batchLimit = isEmergency ? 2 : 1;

  // Asegurar que haya contenido listo en cola; si falta, invocar Cerebro Multimedia
  const { data: readyReels } = await supabase
    .from('media_reels_queue')
    .select('*')
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(batchLimit);

  let reelsToPublish = readyReels || [];

  if (reelsToPublish.length === 0) {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
    const secret = process.env.CRON_SECRET || '';
    const genRes = await fetch(`${baseUrl}/api/media-brain/generate`, {
      method: 'POST',
      headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (genRes.ok) {
      const genData = await genRes.json();
      if (genData.reel) reelsToPublish = [genData.reel];
    }
  }

  for (const reel of reelsToPublish) {
    // Si hay webhook/API de publicación social conectado, enviarlo; siempre marcar publicado en cola
    const socialWebhook = process.env.SOCIAL_PUBLISHER_WEBHOOK_URL;
    if (socialWebhook) {
      await fetch(socialWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: 'Sabor Goo Maldonado',
          reelId: reel.id,
          script: reel.script_text,
          voiceoverSsml: reel.voiceover_ssml,
          subtitles: reel.subtitles_json,
          videoPrompt: reel.video_prompt,
          mode: isEmergency ? 'emergency_13h' : isNightWarmup ? 'night_warmup' : 'normal',
        }),
      }).catch(() => null);
    }

    await supabase
      .from('media_reels_queue')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', reel.id);
  }

  const mode = isEmergency ? 'emergency_13h' : isNightWarmup ? 'night_warmup' : 'normal';
  await supabase.from('engine_logs').insert({
    engine_name: 'Motor 1 · Publicador Multi-Red',
    mode,
    action_summary: `Publicados ${reelsToPublish.length} Reel(s) HD verticales (${mode}). Pedidos hoy: ${todayOrdersCount ?? 0}/${settings.daily_order_goal}.`,
    metadata: { publishedIds: reelsToPublish.map((r) => r.id), jitterMs },
  });

  return NextResponse.json({
    ok: true,
    mode,
    publishedCount: reelsToPublish.length,
  });
}

export async function GET(req: NextRequest) {
  return handleEngine1(req);
}

export async function POST(req: NextRequest) {
  return handleEngine1(req);
}
