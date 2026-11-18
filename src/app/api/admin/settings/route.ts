import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';
import { computeOptimizedRouteSchedule, getMontevideoNow } from '@/lib/logistics';
import { sendPushToCustomerPhone } from '@/lib/push';
import { AppSettings, OrderRecord } from '@/types';

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const uyNow = getMontevideoNow();

    const [{ data: settings }, { data: orders }, { data: engineLogs }] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('engine_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const allOrders = (orders || []) as OrderRecord[];
    const validOrders = allOrders.filter((o) =>
      ['confirmed', 'preparing', 'on_the_way', 'delivered'].includes(o.order_status)
    );

    const nowMs = Date.now();
    const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

    const calcMetrics = (list: OrderRecord[]) => {
      const revenue = list.reduce((acc, o) => acc + (o.total_uyu || 0), 0);
      const ingredientCost = list.reduce((acc, o) => acc + (o.total_cost_uyu || 0), 0);
      const freeMealsCost = list
        .filter((o) => o.free_meal_applied)
        .reduce((acc, o) => acc + (o.discount_amount_uyu || 0), 0);
      const netProfit = revenue - ingredientCost;
      const marginPercent = revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : 0;
      return {
        ordersCount: list.length,
        revenueUyu: revenue,
        ingredientCostUyu: ingredientCost,
        freeMealsDiscountUyu: freeMealsCost,
        netProfitUyu: netProfit,
        marginPercent,
      };
    };

    const dailyOrders = validOrders.filter((o) => o.delivery_date === uyNow.isoDate);
    const weeklyOrders = validOrders.filter(
      (o) => new Date(o.created_at).getTime() >= sevenDaysAgoMs
    );
    const monthlyOrders = validOrders.filter(
      (o) => new Date(o.created_at).getTime() >= thirtyDaysAgoMs
    );

    const activeRouteOrders = allOrders.filter((o) =>
      ['confirmed', 'preparing', 'on_the_way'].includes(o.order_status)
    );

    const routeSchedule = settings
      ? computeOptimizedRouteSchedule(activeRouteOrders, settings as AppSettings)
      : [];

    return NextResponse.json({
      settings,
      finances: {
        daily: calcMetrics(dailyOrders),
        weekly: calcMetrics(weeklyOrders),
        monthly: calcMetrics(monthlyOrders),
      },
      orders: allOrders.slice(0, 80),
      routeSchedule,
      engineLogs: engineLogs || [],
    });
  } catch (error) {
    console.error('GET /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Error cargando panel admin.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    // Actualización rápida de estado de un pedido individual
    if (body.orderId && body.orderStatus) {
      const updateFields: Record<string, unknown> = {
        order_status: body.orderStatus,
        updated_at: new Date().toISOString(),
      };
      if (body.orderStatus === 'on_the_way') {
        updateFields.assigned_driver_id = admin.id;
      }

      const { data: updatedOrder } = await supabase
        .from('orders')
        .update(updateFields)
        .eq('id', body.orderId)
        .select('*')
        .single();

      if (updatedOrder) {
        if (body.orderStatus === 'on_the_way') {
          await sendPushToCustomerPhone(updatedOrder.customer_phone, {
            title: `¡Tu pedido #${updatedOrder.order_number} ya salió en camino!`,
            body: 'Sigue al repartidor en vivo desde el mapa hasta que llegue a tu puerta.',
            url: `/tracking/${updatedOrder.id}`,
            tag: `on-way-${updatedOrder.id}`,
          });
        } else if (body.orderStatus === 'delivered') {
          await sendPushToCustomerPhone(updatedOrder.customer_phone, {
            title: `Pedido #${updatedOrder.order_number} entregado · ¡Buen provecho!`,
            body: 'Tu racha de días hábiles en Sabor Goo sigue sumando beneficios.',
            url: `/tracking/${updatedOrder.id}`,
            tag: `delivered-${updatedOrder.id}`,
          });
        }
      }

      return NextResponse.json({ updatedOrder });
    }

    // Actualización de configuración logística (vehículo activo, tiempos, metas)
    const allowedFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (['bici', 'moto', 'auto'].includes(body.active_vehicle)) {
      allowedFields.active_vehicle = body.active_vehicle;
    }
    if (typeof body.opening_hour === 'string') allowedFields.opening_hour = body.opening_hour;
    if (typeof body.stop_minutes_base === 'number')
      allowedFields.stop_minutes_base = body.stop_minutes_base;
    if (typeof body.stop_minutes_cash_extra === 'number')
      allowedFields.stop_minutes_cash_extra = body.stop_minutes_cash_extra;
    if (typeof body.speed_bici_kmh === 'number') allowedFields.speed_bici_kmh = body.speed_bici_kmh;
    if (typeof body.speed_moto_kmh === 'number') allowedFields.speed_moto_kmh = body.speed_moto_kmh;
    if (typeof body.speed_auto_kmh === 'number') allowedFields.speed_auto_kmh = body.speed_auto_kmh;
    if (typeof body.daily_order_goal === 'number')
      allowedFields.daily_order_goal = body.daily_order_goal;

    const { data: updatedSettings, error } = await supabase
      .from('app_settings')
      .update(allowedFields)
      .eq('id', 1)
      .select('*')
      .single();

    if (error || !updatedSettings) {
      return NextResponse.json({ error: 'No se pudo actualizar configuración.' }, { status: 400 });
    }

    // Recalcular instantáneamente los tiempos estimados de todos los pedidos activos
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('*')
      .in('order_status', ['confirmed', 'preparing', 'on_the_way']);

    if (activeOrders && activeOrders.length > 0) {
      const schedule = computeOptimizedRouteSchedule(
        activeOrders as OrderRecord[],
        updatedSettings as AppSettings
      );
      for (const stop of schedule) {
        await supabase
          .from('orders')
          .update({
            route_sequence: stop.sequence,
            estimated_arrival_at: stop.estimatedArrivalIso,
          })
          .eq('id', stop.orderId);
      }
    }

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error('PATCH /api/admin/settings error:', error);
    return NextResponse.json({ error: 'Error actualizando configuración.' }, { status: 500 });
  }
}
