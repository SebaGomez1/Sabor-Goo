import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';
import { sendPushToCustomerPhone } from '@/lib/push';
import { getMontevideoNow } from '@/lib/logistics';

async function runEngine5(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single();
  if (!settings?.engines_enabled) {
    return NextResponse.json({ skipped: true, reason: 'engines_disabled' });
  }

  const uyNow = getMontevideoNow();
  const { data: customers } = await supabase.from('customers').select('*').limit(500);

  let notifiedCount = 0;

  for (const cust of customers || []) {
    let bodyMsg = '';

    if (cust.has_free_daily_meal) {
      bodyMsg = `¡Hola ${cust.full_name}! Tienes tu COMIDA GRATIS diaria activa por tus ${cust.active_daily_referrals_count} referidos. Reserva antes de las 21:00 hs para mañana.`;
    } else if (cust.has_25_off) {
      bodyMsg = `¡Hola ${cust.full_name}! Conservas tu 25% OFF activo en Sabor Goo. Recuerda reservar antes de las 21:00 hs para no cortar tu racha.`;
    } else if (cust.consecutive_business_days > 0) {
      const remaining = Math.max(1, 4 - cust.consecutive_business_days);
      bodyMsg = `¡Hola ${cust.full_name}! Llevas ${cust.consecutive_business_days} día(s) de racha. Te faltan ${remaining} día(s) para desbloquear 25% OFF vitalicio. Cierre hoy 21:00 hs.`;
    } else {
      bodyMsg = `¡Hola ${cust.full_name}! Queda 1 hora y media para el cierre de las 21:00 hs en Sabor Goo. Asegura tu bandeja casera abundante para mañana.`;
    }

    const sent = await sendPushToCustomerPhone(cust.phone, {
      title: 'Sabor Goo · Cierre de reservas 21:00 hs',
      body: bodyMsg,
      url: '/',
      tag: `reminder-1930-${uyNow.isoDate}`,
    });

    if (sent > 0) notifiedCount++;
  }

  await supabase.from('engine_logs').insert({
    engine_name: 'Motor 5 · Persistencia 19:30 hs',
    mode: 'normal',
    action_summary: `Recordatorio de cierre 21:00 hs y estado de rachas/referidos enviado a ${notifiedCount} cliente(s) suscritos.`,
    metadata: { notifiedCount, uruguayDate: uyNow.isoDate },
  });

  return NextResponse.json({ ok: true, notifiedCount });
}

export async function GET(req: NextRequest) {
  return runEngine5(req);
}

export async function POST(req: NextRequest) {
  return runEngine5(req);
}
