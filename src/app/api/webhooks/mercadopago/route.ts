import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeOptimizedRouteSchedule } from '@/lib/logistics';
import { sendPushToAllAdmins, sendPushToCustomerPhone } from '@/lib/push';
import { AppSettings, CartItem, OrderRecord } from '@/types';

function verifyMercadoPagoSignature(req: NextRequest, dataId: string): boolean {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!webhookSecret) return true;

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  if (!xSignature || !xRequestId) return false;

  const parts = xSignature.split(',');
  let ts = '';
  let hash = '';

  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k === 'ts') ts = v;
    if (k === 'v1') hash = v;
  }

  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  const a = Buffer.from(hash);
  const b = Buffer.from(computed);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = body?.type || req.nextUrl.searchParams.get('topic');
    const dataId = String(body?.data?.id || req.nextUrl.searchParams.get('data.id') || '');

    if (topic !== 'payment' || !dataId) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (!verifyMercadoPagoSignature(req, dataId)) {
      return NextResponse.json({ error: 'Firma webhook inválida' }, { status: 401 });
    }

    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpAccessToken) {
      return NextResponse.json({ error: 'Falta MERCADOPAGO_ACCESS_TOKEN' }, { status: 500 });
    }

    const mpClient = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const paymentApi = new Payment(mpClient);
    const paymentInfo = await paymentApi.get({ id: dataId });

    const orderId = paymentInfo.external_reference;
    if (!orderId) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (order.payment_status === 'approved') {
      return NextResponse.json({ received: true, alreadyApproved: true }, { status: 200 });
    }

    if (paymentInfo.status === 'approved') {
      await supabase
        .from('orders')
        .update({
          payment_status: 'approved',
          order_status: 'confirmed',
          mp_payment_id: String(paymentInfo.id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      const items = (order.items || []) as CartItem[];
      for (const item of items) {
        const { data: menu } = await supabase
          .from('menus')
          .select('daily_stock')
          .eq('id', item.menu_id)
          .single();

        if (menu) {
          await supabase
            .from('menus')
            .update({ daily_stock: Math.max(0, menu.daily_stock - item.qty) })
            .eq('id', item.menu_id);
        }
      }

      await supabase.rpc('process_confirmed_order_rewards', {
        p_order_id: order.id,
      });

      const [{ data: settings }, { data: dayOrders }] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', 1).single(),
        supabase
          .from('orders')
          .select('*')
          .eq('delivery_date', order.delivery_date)
          .in('order_status', ['confirmed', 'preparing', 'on_the_way']),
      ]);

      if (settings && dayOrders && dayOrders.length > 0) {
        const schedule = computeOptimizedRouteSchedule(
          dayOrders as OrderRecord[],
          settings as AppSettings
        );
        const myStop = schedule.find((s) => s.orderId === order.id);
        if (myStop) {
          await supabase
            .from('orders')
            .update({
              route_sequence: myStop.sequence,
              estimated_arrival_at: myStop.estimatedArrivalIso,
            })
            .eq('id', order.id);
        }
      }

      await Promise.all([
        sendPushToCustomerPhone(order.customer_phone, {
          title: `¡Pago aprobado! Pedido #${order.order_number} confirmado`,
          body: 'Ya puedes enviar tu comanda por WhatsApp y seguir al repartidor en vivo.',
          url: `/tracking/${order.id}`,
          tag: `mp-approved-${order.id}`,
        }),
        sendPushToAllAdmins({
          title: `Pago MP Aprobado · Pedido #${order.order_number} ($${order.total_uyu} UYU)`,
          body: `${order.customer_name} · ${order.zone_name}`,
          url: '/admin',
          playAlertSound: true,
          tag: `admin-mp-${order.id}`,
        }),
      ]);
    } else if (paymentInfo.status === 'rejected' || paymentInfo.status === 'cancelled') {
      await supabase
        .from('orders')
        .update({
          payment_status: 'rejected',
          order_status: 'cancelled',
          mp_payment_id: String(paymentInfo.id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook MercadoPago error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
