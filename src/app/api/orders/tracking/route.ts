import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { calculateHaversineKm } from '@/lib/geo';
import { buildWhatsAppOrderUrl } from '@/lib/whatsapp';

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('id');
    if (!orderId) {
      return NextResponse.json({ error: 'Falta ID de pedido.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const [{ data: order, error }, { data: settings }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).single(),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    if (error || !order) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    let driverLiveLocation: { lat: number; lng: number; distanceKm: number } | null = null;

    if (order.order_status === 'on_the_way') {
      let driverQuery = supabase
        .from('admin_accounts')
        .select('current_lat, current_lng, is_on_delivery')
        .eq('is_on_delivery', true)
        .eq('is_active', true);

      if (order.assigned_driver_id) {
        driverQuery = driverQuery.eq('id', order.assigned_driver_id);
      }

      const { data: activeDriver } = await driverQuery.limit(1).maybeSingle();

      if (activeDriver?.current_lat && activeDriver?.current_lng) {
        const dist = calculateHaversineKm(
          activeDriver.current_lat,
          activeDriver.current_lng,
          order.lat,
          order.lng
        );
        driverLiveLocation = {
          lat: activeDriver.current_lat,
          lng: activeDriver.current_lng,
          distanceKm: dist,
        };
      }
    }

    let whatsappUrl: string | null = null;
    const isPaidOrCash =
      order.payment_status === 'approved' || order.payment_status === 'cash_on_delivery';

    if (isPaidOrCash && settings) {
      const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://vercel.app';

      whatsappUrl = buildWhatsAppOrderUrl({
        businessWhatsapp: settings.whatsapp_number,
        orderNumber: order.order_number,
        orderId: order.id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryDate: order.delivery_date,
        requestedTimeSlot: order.requested_time_slot,
        zoneName: order.zone_name,
        addressReference: order.address_reference,
        lat: order.lat,
        lng: order.lng,
        items: order.items,
        subtotalUyu: order.subtotal_uyu,
        discountPercent: order.discount_percent,
        discountAmountUyu: order.discount_amount_uyu,
        freeMealApplied: order.free_meal_applied,
        totalUyu: order.total_uyu,
        paymentMethod: order.payment_method,
        cashNeedsChange: order.cash_needs_change,
        cashPaidWithUyu: order.cash_paid_with_uyu,
        cashChangeUyu: order.cash_change_uyu,
        appBaseUrl,
      });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        delivery_date: order.delivery_date,
        requested_time_slot: order.requested_time_slot,
        zone_name: order.zone_name,
        address_reference: order.address_reference,
        lat: order.lat,
        lng: order.lng,
        items: order.items,
        subtotal_uyu: order.subtotal_uyu,
        discount_percent: order.discount_percent,
        discount_amount_uyu: order.discount_amount_uyu,
        free_meal_applied: order.free_meal_applied,
        total_uyu: order.total_uyu,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        cash_needs_change: order.cash_needs_change,
        cash_paid_with_uyu: order.cash_paid_with_uyu,
        cash_change_uyu: order.cash_change_uyu,
        order_status: order.order_status,
        route_sequence: order.route_sequence,
        estimated_arrival_at: order.estimated_arrival_at,
        delay_minutes: order.delay_minutes,
        whatsapp_sent: order.whatsapp_sent,
        created_at: order.created_at,
      },
      storeLocation: settings
        ? { lat: settings.store_lat, lng: settings.store_lng }
        : { lat: -34.9089, lng: -54.9583 },
      driverLiveLocation,
      whatsappUrl,
    });
  } catch (error) {
    console.error('GET /api/orders/tracking error:', error);
    return NextResponse.json(
      { error: 'Error al consultar el seguimiento del pedido.' },
      { status: 500 }
    );
  }
}
