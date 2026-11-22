import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { normalizeUruguayPhone } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription, customerPhone } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Suscripcion push invalida.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const admin = getAdminFromRequest(req);
    const normalizedPhone = !admin && customerPhone ? normalizeUruguayPhone(String(customerPhone)) : null;

    await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        customer_phone: normalizedPhone,
        admin_id: admin?.id || null,
        user_agent: req.headers.get('user-agent') || null,
      },
      { onConflict: 'endpoint' }
    );

    return NextResponse.json({ subscribed: true, role: admin ? 'admin' : 'client' });
  } catch (error) {
    console.error('POST /api/push/subscribe error:', error);
    return NextResponse.json({ error: 'Error registrando notificaciones.' }, { status: 500 });
  }
}