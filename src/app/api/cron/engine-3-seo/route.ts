import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';

async function runEngine3(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: settings }, { data: menus }] = await Promise.all([
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('menus').select('*').eq('is_active', true),
  ]);

  if (!settings?.engines_enabled) {
    return NextResponse.json({ skipped: true, reason: 'engines_disabled' });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://vercel.app').replace(/\/$/, '');

  const schemaMenu = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'Sabor Goo Maldonado',
    servesCuisine: 'Comida Casera Uruguaya Abundante',
    areaServed: [
      'Maldonado, Uruguay',
      'Playa Mansa Parada 1 a Parada 25, Punta del Este, Uruguay',
    ],
    url: appUrl,
    hasMenu: {
      '@type': 'Menu',
      hasMenuItem: (menus || []).map((m) => ({
        '@type': 'MenuItem',
        name: m.title,
        description: m.description,
        offers: {
          '@type': 'Offer',
          price: m.price_uyu,
          priceCurrency: 'UYU',
        },
      })),
    },
  };

  // Ping opcional a Google Business / IndexNow si hay endpoint configurado
  const gmbWebhook = process.env.GOOGLE_BUSINESS_SYNC_WEBHOOK_URL;
  if (gmbWebhook) {
    await fetch(gmbWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaMenu, updatedAt: new Date().toISOString() }),
    }).catch(() => null);
  }

  await supabase.from('engine_logs').insert({
    engine_name: 'Motor 3 · SEO Local Dinámico',
    mode: 'normal',
    action_summary: `Schema.org/Menu actualizado con ${(menus || []).length} platos activos para búsquedas en Maldonado y Playa Mansa Paradas 1-25.`,
    metadata: { itemsCount: (menus || []).length },
  });

  return NextResponse.json({ ok: true, schemaMenu });
}

export async function GET(req: NextRequest) {
  return runEngine3(req);
}

export async function POST(req: NextRequest) {
  return runEngine3(req);
}
