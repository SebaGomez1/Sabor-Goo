import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/auth';
import { getMontevideoNow } from '@/lib/logistics';

const B2B_CLUSTERS = [
  {
    placeName: 'Obras en Construcción · Av. Roosevelt y Paradas 1 a 12 Playa Mansa',
    sector: 'obra',
    zoneName: 'Playa Mansa (Paradas 1 a 12)',
    lat: -34.9435,
    lng: -54.9512,
  },
  {
    placeName: 'Torres y Obras · Playa Mansa Paradas 13 a 25 y Pinares',
    sector: 'obra',
    zoneName: 'Playa Mansa (Paradas 13 a 25)',
    lat: -34.9225,
    lng: -54.9765,
  },
  {
    placeName: 'Sanatorios, Clínicas y Centros Médicos · Maldonado Centro',
    sector: 'hospital',
    zoneName: 'Maldonado Centro / Barrios',
    lat: -34.9082,
    lng: -54.9565,
  },
  {
    placeName: 'Oficinas, Comercios y Estudios · Peatonal Sarandí y Av. Batlle',
    sector: 'oficina',
    zoneName: 'Maldonado Centro / Barrios',
    lat: -34.9095,
    lng: -54.9590,
  },
  {
    placeName: 'Talleres, Barracas y Depósitos · Cerro Pelado y Maldonado Nuevo',
    sector: 'taller',
    zoneName: 'Maldonado - Cerro Pelado / Maldonado Nuevo',
    lat: -34.8895,
    lng: -54.9620,
  },
];

async function runEngine4(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', 1).single();
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
    ? B2B_CLUSTERS
    : [B2B_CLUSTERS[Math.floor(Math.random() * B2B_CLUSTERS.length)]];

  const insertedLeads = [];

  for (const cluster of selectedClusters) {
    const pitchMessage = `¡Hola equipo de ${cluster.placeName}! En Sabor Goo preparamos viandas caseras muy bien servidas y abundantes (sin escatimar) con entrega puntual en ${cluster.zoneName} y seguimiento en vivo del repartidor. Beneficio Pedido Grupal: si 10 compañeros piden con tu link, ¡tu almuerzo diario te sale GRATIS! Reservá hoy antes de las 21:00 hs en ${appUrl}`;

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
    engine_name: 'Motor 4 · Captación B2B Geolocalizada',
    mode: isEmergency13h ? 'emergency_13h' : 'normal',
    action_summary: isEmergency13h
      ? `MODO EMERGENCIA 13:00-21:00 HS ACTIVO (${todayOrdersCount ?? 0}/${settings.daily_order_goal} pedidos): captación masiva duplicada en Playa Mansa Paradas 1-25 y todo Maldonado (${insertedLeads.length} frentes B2B).`
      : `Campaña B2B generada para ${selectedClusters.at(0)?.placeName}.`,
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
