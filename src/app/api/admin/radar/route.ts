import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { computeOptimizedRouteSchedule } from '@/lib/logistics';
import { sendPushToCustomerPhone } from '@/lib/push';
import { AppSettings, OrderRecord } from '@/types';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: admins } = await supabase
    .from('admin_accounts')
    .select('id, email, full_name, phone, role, is_on_delivery, current_lat, current_lng, last_gps_at, is_active')
    .eq('is_active', true);

  return NextResponse.json({ admins: admins || [] });
}

export async function POST(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { lat, lng, isOnDelivery } = body;
    const supabase = getSupabaseAdmin();

    const updatePayload: Record<string, unknown> = {
      last_gps_at: new Date().toISOString(),
    };
    if (typeof lat === 'number' && typeof lng === 'number') {
      updatePayload.current_lat = lat;
      updatePayload.current_lng = lng;
    }
    if (typeof isOnDelivery === 'boolean') {
      updatePayload.is_on_delivery = isOnDelivery;
    }

    await supabase.from('admin_accounts').update(updatePayload).eq('id', admin.id);

    let driverDelayAlert = false;
    let delayedOrdersCount = 0;

    if (typeof lat === 'number' && typeof lng === 'number' && isOnDelivery) {
      const [{ data: settings }, { data: activeOrders }] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', 1).single(),
        supabase
          .from('orders')
          .select('*')
          .in('order_status', ['confirmed', 'preparing', 'on_the_way']),
      ]);

      if (settings && activeOrders && activeOrders.length > 0) {
        const schedule = computeOptimizedRouteSchedule(
          activeOrders as OrderRecord[],
          settings as AppSettings,
          lat,
          lng
        );

        for (const stop of schedule) {
          const existing = (activeOrders as OrderRecord[]).find((o) => o.id === stop.orderId);
          if (!existing) continue;

          if (stop.isDelayedByTwoOrMoreMin) {
            driverDelayAlert = true;
            delayedOrdersCount++;

            if (!existing.delay_notified) {
              await supabase
                .from('orders')
                .update({
                  delay_minutes: stop.delayMinutes,
                  delay_notified: true,
                  estimated_arrival_at: stop.estimatedArrivalIso,
                })
                .eq('id', existing.id);

              await sendPushToCustomerPhone(existing.customer_phone, {
                title: `Actualización de entrega · Pedido #${existing.order_number}`,
                body: `Tu repartidor tiene una demora de ${stop.delayMinutes} min por tránsito en ruta. Nueva llegada estimada: ${stop.estimatedArrivalTimeStr} hs.`,
                url: `/tracking/${existing.id}`,
                tag: `delay-${existing.id}`,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({
      updated: true,
      driverDelayAlert,
      delayedOrdersCount,
    });
  } catch (error) {
    console.error('POST /api/admin/radar error:', error);
    return NextResponse.json({ error: 'Error actualizando GPS.' }, { status: 500 });
  }
}
