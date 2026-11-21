import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';
import { getMontevideoNow } from '@/lib/logistics';

const CHIVITERIA_CLUSTERS = [
  {
    placeName: 'Edificios, Apartamentos y Turistas · Av. Roosevelt y Paradas 1 a 12 Playa Mansa',
    sector: 'residencial_turismo',
    zoneName: 'Playa Mansa (Paradas 1 a 12)',
    lat: -34.9435,
    lng: -54.9512,
  },
  {
    placeName: 'Complejos y Vecinos · Playa Mansa Paradas 13 a 25 y Pinares',
    sector: 'residencial',
    zoneName: 'Playa Mansa (Paradas 13 a 25)',
    lat: -34.9225,
    lng: -54.9765,
  },
  {
    placeName: 'Comercios, Estudios y Nocturnidad · Maldonado Centro y Peatonal Sarandí',
    sector: 'centro_comercial',
    zoneName: 'Maldonado Centro / Barrios',
    lat: -34.9095,
    lng: -54.9590,
  },
  {
    placeName: 'Clubes, Canchas de Fútbol 5 y Juntadas · Maldonado',
    sector: 'deporte_juntadas',
    zoneName: 'Maldonado Centro / Barrios',
    lat: -34.9082,
    lng: -54.9565,
  },
  {
    placeName: 'Familias y Barrios · Cerro Pelado, Lausana y Maldonado Nuevo',
    sector: 'barrios',
    zoneName: 'Maldonado · Cerro Pelado y Maldonado Nuevo',
    lat: -34.8895,
    lng: -54.9620,
  },
];

async function runEngine4(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const [{ data: settings }, { data: activeMenus }] = await Promise.all([
    supabase.from('app_settings').select('*').eq('id', 1).single(),
    supabase.from('menus').select('title, price_uyu, description, image_url').eq('is_active', true),
  ]);

  if (!settings?.engines_enabled) {
    return NextResponse.json({ skipped: true, reason: 'engines_disabled' });
  }

  const uyNow = getMontevideoNow();
  const { count: todayOrdersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('delivery_date', uyNow.isoDate)
    .in('order_status', ['confirmed', 'preparing', 'on_the_way', 'delivered']);

  const isEmergency13h =
    settings.emergency_mode_forced ||
    (uyNow.hour >= 13 &&
      uyNow.hour < 21 &&
      (todayOrdersCount ?? 0) < (settings.daily_order_goal || 35));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://vercel.app').replace(/\/$/, '');

  // En modo emergencia expande a todos los clusters incluyendo toda Playa Mansa Paradas 1-25
  const selectedClusters = isEmergency13h
    ? CHIVITERIA_CLUSTERS
    : [CHIVITERIA_CLUSTERS[Math.floor(Math.random() * CHIVITERIA_CLUSTERS.length)]];

  const menusList = activeMenus || [];
  const insertedLeads = [];

  for (const cluster of selectedClusters) {
    const featured =
      menusList.length > 0
        ? menusList[Math.floor(Math.random() * menusList.length)]
        : null;

    const dishHighlight = featured
      ? `Probá nuestro ${featured.title} ($${featured.price_uyu} UYU): ${featured.description || 'hecho al momento con ingredientes frescos'}.`
      : 'Probá nuestros chivitos artesanales completos hechos al momento con papas fritas.';

    const pitchMessage = `🔥 ¡Hola gente de ${cluster.placeName}! En Sabor Goo · Chivetería preparamos chivitos uruguayos al instante con entrega rápida en ${cluster.zoneName} y seguimiento en vivo del repartidor. ${dishHighlight} Beneficios: 25% OFF si pedís 3 días seguidos, y mientras mantengas 10 referidos activos comprando con tu link (en el día o a diario), ¡tu pedido te sale GRATIS! (Si bajás a 9 activos, seguís con tu 25% OFF por compra diaria). Pedilo ahora al instante en ${appUrl} #ChiviteriaMaldonado #ChivitoUruguayo #SaborGoo`;

    const { data: lead } = await supabase
      .from('social_leads_b2b')
      .insert({
        place_name: cluster.placeName,
        sector: cluster.sector,
        zone_name: cluster.zoneName,
        lat: cluster.lat,
        lng: cluster.lng,
        pitch_message: pitchMessage,
        status: 'queued',
      })
      .select('*')
      .single();

    if (lead) insertedLeads.push(lead);
  }

  await supabase.from('engine_logs').insert({
    engine_name: 'Motor 4 · Captación Chivetería Geolocalizada',
    mode: isEmergency13h ? 'emergency_13h' : 'normal',
    action_summary: isEmergency13h
      ? `MODO EMERGENCIA 13:00–21:00 HS ACTIVO (${todayOrdersCount ?? 0}/${settings.daily_order_goal} pedidos): captación masiva de chivetería en Playa Mansa Paradas 1-25 y todo Maldonado (${insertedLeads.length} zonas).`
      : `Campaña de chivetería al instante generada para ${selectedClusters.at(0)?.placeName}.`,
    metadata: { emergency: isEmergency13h, leadsCount: insertedLeads.length },
  });

  return NextResponse.json({
    ok: true,
    emergencyMode: isEmergency13h,
    leadsGenerated: insertedLeads.length,
  });
}

export async function GET(req: NextRequest) {
  return runEngine4(req);
}

export async function POST(req: NextRequest) {
  return runEngine4(req);
}
