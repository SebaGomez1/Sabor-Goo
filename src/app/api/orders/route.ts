import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getSupabaseAdmin } from '@/lib/supabase';
import { validateDeliveryCoverage } from '@/lib/geo';
import { resolveNextBookingWindow, computeOptimizedRouteSchedule } from '@/lib/logistics';
import { buildWhatsAppOrderUrl, normalizeUruguayPhone } from '@/lib/whatsapp';
import { sendPushToAllAdmins } from '@/lib/push';
import { AppSettings, CartItem, OrderRecord } from '@/types';

const CreateOrderSchema = z.object({
  customerName: z.string().trim().min(2, 'Ingresa tu nombre').max(80),
  customerPhone: z.string().trim().min(7, 'Ingresa un celular válido').max(25),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  requestedTimeSlot: z.string().trim().min(3).max(40),
  addressReference: z.string().trim().min(3, 'Ingresa calle, puerta, apto u obra').max(180),
  lat: z.number(),
  lng: z.number(),
  items: z
    .array(
      z.object({
        menu_id: z.string().uuid(),
        qty: z.number().int().min(1).max(25),
      })
    )
    .min(1, 'Agrega al menos un plato'),
  paymentMethod: z.enum(['mercadopago', 'efectivo']),
  cashNeedsChange: z.boolean().optional().default(false),
  cashPaidWithUyu: z.number().nonnegative().optional().default(0),
  referralCodeUsed: z.string().trim().max(30).optional().nullable(),
  deviceToken: z.string().trim().max(120).optional().nullable(),
});

function generateReferralCode(name: string, phone: string): string {
  const cleanName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'G');
  const last4 = phone.replace(/\D/g, '').slice(-4).padStart(4, '0');
  const rand = Math.floor(10 + Math.random() * 89);
  return `${cleanName}${last4}${rand}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const rawPhone = req.nextUrl.searchParams.get('phone') || '';
    const phone = rawPhone ? normalizeUruguayPhone(rawPhone) : '';

    const [{ data: settings }, { data: menus }] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      supabase
        .from('menus')
        .select(
          'id, day_of_week, day_label, title, description, abundance_badge, category, price_uyu, image_url, daily_stock, is_active'
        )
        .eq('is_active', true)
        .order('day_of_week', { ascending: true }),
    ]);

    const bookingWindow = resolveNextBookingWindow(settings?.cutoff_hour ?? 21);

    let customer = null;
    let activeOrder = null;

    if (phone && phone.length >= 8) {
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      customer = custData;

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_phone', phone)
        .in('order_status', ['confirmed', 'preparing', 'on_the_way'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      activeOrder = orderData;
    }

    return NextResponse.json({
      settings: settings
        ? {
            business_name: settings.business_name,
            whatsapp_number: settings.whatsapp_number,
            store_lat: settings.store_lat,
            store_lng: settings.store_lng,
            opening_hour: settings.opening_hour,
            cutoff_hour: settings.cutoff_hour,
          }
        : null,
      bookingWindow,
      menus: menus || [],
      customer,
      activeOrder,
    });
  } catch (error) {
    console.error('GET /api/orders error:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar la información del catálogo.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues.at(0);
      return NextResponse.json(
        { error: firstIssue?.message || 'Datos de pedido inválidos.' },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const normalizedPhone = normalizeUruguayPhone(input.customerPhone);
    const supabase = getSupabaseAdmin();

    const { data: blacklisted } = await supabase
      .from('blacklist')
      .select('id, is_blocked')
      .eq('phone', normalizedPhone)
      .eq('is_blocked', true)
      .maybeSingle();

    if (blacklisted) {
      return NextResponse.json(
        {
          error:
            'Este número de celular tiene una restricción activa en el sistema y no puede completar pedidos.',
          blocked: true,
        },
        { status: 403 }
      );
    }

    const { data: settingsData, error: settingsErr } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (settingsErr || !settingsData) {
      return NextResponse.json(
        { error: 'Configuración del sistema no disponible.' },
        { status: 500 }
      );
    }

    const settings = settingsData as AppSettings;
    const geoCheck = validateDeliveryCoverage(
      input.lat,
      input.lng,
      settings.store_lat,
      settings.store_lng
    );

    if (!geoCheck.allowed) {
      return NextResponse.json(
        { error: geoCheck.reason || 'Ubicación fuera de cobertura.' },
        { status: 400 }
      );
    }

    const menuIds = input.items.map((i) => i.menu_id);
    const { data: dbMenus, error: menusErr } = await supabase
      .from('menus')
      .select('*')
      .in('id', menuIds)
      .eq('is_active', true);

    if (menusErr || !dbMenus || dbMenus.length !== menuIds.length) {
      return NextResponse.json(
        { error: 'Uno o más platos seleccionados ya no están disponibles.' },
        { status: 400 }
      );
    }

    const menuMap = new Map(dbMenus.map((m) => [m.id, m]));
    let subtotalUyu = 0;
    let totalCostUyu = 0;
    const resolvedItems: CartItem[] = [];

    for (const reqItem of input.items) {
      const dbMenu = menuMap.get(reqItem.menu_id);
      if (!dbMenu) {
        return NextResponse.json({ error: 'Plato inválido.' }, { status: 400 });
      }
      if (dbMenu.daily_stock < reqItem.qty) {
        return NextResponse.json(
          {
            error: `Stock insuficiente para "${dbMenu.title}". Quedan ${dbMenu.daily_stock} unidades disponibles hoy. Puedes reservar para el próximo día hábil.`,
            outOfStockMenuId: dbMenu.id,
          },
          { status: 409 }
        );
      }

      subtotalUyu += dbMenu.price_uyu * reqItem.qty;
      totalCostUyu += (dbMenu.ingredient_cost_uyu || 0) * reqItem.qty;

      resolvedItems.push({
        menu_id: dbMenu.id,
        title: dbMenu.title,
        qty: reqItem.qty,
        unit_price: dbMenu.price_uyu,
        unit_cost: dbMenu.ingredient_cost_uyu || 0,
        is_free_reward: false,
      });
    }

    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    const cleanReferralUsed = input.referralCodeUsed?.trim().toUpperCase() || null;

    if (!customer) {
      const newRefCode = generateReferralCode(input.customerName, normalizedPhone);
      const { data: createdCustomer, error: createCustErr } = await supabase
        .from('customers')
        .insert({
          phone: normalizedPhone,
          full_name: input.customerName,
          referral_code: newRefCode,
          referred_by_code: cleanReferralUsed,
          device_token: input.deviceToken || null,
        })
        .select('*')
        .single();

      if (createCustErr) {
        return NextResponse.json(
          { error: 'Error al registrar perfil de cliente.' },
          { status: 500 }
        );
      }
      customer = createdCustomer;
    } else if (input.deviceToken && customer.device_token !== input.deviceToken) {
      await supabase
        .from('customers')
        .update({ device_token: input.deviceToken, full_name: input.customerName })
        .eq('id', customer.id);
    }

    let freeMealApplied = false;
    let discountPercent = 0;
    let discountAmountUyu = 0;

    const alreadyUsedFreeMealToday = customer.last_free_meal_date === input.deliveryDate;
    const firstResolvedItem = resolvedItems.at(0);

    if (customer.has_free_daily_meal && !alreadyUsedFreeMealToday && firstResolvedItem) {
      freeMealApplied = true;
      discountAmountUyu = firstResolvedItem.unit_price;
      firstResolvedItem.is_free_reward = true;
    } else if (customer.has_25_off) {
      discountPercent = 25;
      discountAmountUyu = Math.round(subtotalUyu * 0.25);
    }

    const totalUyu = Math.max(0, subtotalUyu - discountAmountUyu);

    let cashChangeUyu = 0;
    if (input.paymentMethod === 'efectivo' && totalUyu > 0) {
      if (input.cashNeedsChange) {
        if (!input.cashPaidWithUyu || input.cashPaidWithUyu < totalUyu) {
          return NextResponse.json(
            {
              error: `El monto con el que abonas ($${input.cashPaidWithUyu}) debe ser mayor o igual al total ($${totalUyu} UYU).`,
            },
            { status: 400 }
          );
        }
        cashChangeUyu = input.cashPaidWithUyu - totalUyu;
      }
    }

    const isMercadoPagoRequired = input.paymentMethod === 'mercadopago' && totalUyu > 0;
    const initialPaymentStatus = isMercadoPagoRequired
      ? 'pending'
      : totalUyu === 0
      ? 'approved'
      : 'cash_on_delivery';
    const initialOrderStatus = isMercadoPagoRequired ? 'awaiting_payment' : 'confirmed';

    const { data: createdOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: customer.id,
        customer_name: input.customerName,
        customer_phone: normalizedPhone,
        delivery_date: input.deliveryDate,
        requested_time_slot: input.requestedTimeSlot,
        zone_name: geoCheck.zoneName,
        address_reference: input.addressReference,
        lat: input.lat,
        lng: input.lng,
        items: resolvedItems,
        subtotal_uyu: subtotalUyu,
        discount_percent: discountPercent,
        discount_amount_uyu: discountAmountUyu,
        free_meal_applied: freeMealApplied,
        total_uyu: totalUyu,
        total_cost_uyu: totalCostUyu,
        payment_method: input.paymentMethod,
        payment_status: initialPaymentStatus,
        cash_needs_change: input.paymentMethod === 'efectivo' ? input.cashNeedsChange : false,
        cash_paid_with_uyu: input.paymentMethod === 'efectivo' ? input.cashPaidWithUyu : 0,
        cash_change_uyu: cashChangeUyu,
        order_status: initialOrderStatus,
        referral_code_used: customer.referred_by_code || cleanReferralUsed,
      })
      .select('*')
      .single();

    if (orderErr || !createdOrder) {
      console.error('Insert order error:', orderErr);
      return NextResponse.json(
        { error: 'No se pudo registrar el pedido. Intenta nuevamente.' },
        { status: 500 }
      );
    }

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'https://vercel.app';

    if (isMercadoPagoRequired) {
      const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
      if (!mpAccessToken) {
        return NextResponse.json(
          { error: 'Mercado Pago no está configurado en el servidor.' },
          { status: 500 }
        );
      }

      const mpClient = new MercadoPagoConfig({ accessToken: mpAccessToken });
      const preference = new Preference(mpClient);

      const mpRes = await preference.create({
        body: {
          items: [
            {
              id: createdOrder.id,
              title: `Sabor Goo #${createdOrder.order_number} - Pedido Chivetería al Instante`,
              quantity: 1,
              unit_price: totalUyu,
              currency_id: 'UYU',
            },
          ],
          payer: {
            name: input.customerName,
          },
          external_reference: createdOrder.id,
          notification_url: `${appBaseUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`,
          back_urls: {
            success: `${appBaseUrl.replace(/\/$/, '')}/seguimiento/${createdOrder.id}?mp=approved`,
            failure: `${appBaseUrl.replace(/\/$/, '')}/?mp=failure&order=${createdOrder.id}`,
            pending: `${appBaseUrl.replace(/\/$/, '')}/seguimiento/${createdOrder.id}?mp=pending`,
          },
          auto_return: 'approved',
        },
      });

      await supabase
        .from('orders')
        .update({ mp_preference_id: mpRes.id || null })
        .eq('id', createdOrder.id);

      return NextResponse.json({
        requiresMercadoPago: true,
        checkoutUrl: mpRes.init_point,
        orderId: createdOrder.id,
        orderNumber: createdOrder.order_number,
        customerReferralCode: customer.referral_code,
      });
    }

    for (const item of resolvedItems) {
      const currentMenu = menuMap.get(item.menu_id);
      if (currentMenu) {
        await supabase
          .from('menus')
          .update({ daily_stock: Math.max(0, currentMenu.daily_stock - item.qty) })
          .eq('id', item.menu_id);
      }
    }

    await supabase.rpc('process_confirmed_order_rewards', {
      p_order_id: createdOrder.id,
    });

    const { data: dayOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('delivery_date', input.deliveryDate)
      .in('order_status', ['confirmed', 'preparing', 'on_the_way']);

    if (dayOrders && dayOrders.length > 0) {
      const schedule = computeOptimizedRouteSchedule(dayOrders as OrderRecord[], settings);
      const myStop = schedule.find((s) => s.orderId === createdOrder.id);
      if (myStop) {
        await supabase
          .from('orders')
          .update({
            route_sequence: myStop.sequence,
            estimated_arrival_at: myStop.estimatedArrivalIso,
          })
          .eq('id', createdOrder.id);
      }
    }

    await sendPushToAllAdmins({
      title: `Nuevo Pedido #${createdOrder.order_number} ($${totalUyu} UYU)`,
      body: `${input.customerName} · ${geoCheck.zoneName} · ${input.requestedTimeSlot}`,
      url: '/admin',
      playAlertSound: true,
      tag: `order-${createdOrder.id}`,
    });

    const whatsappUrl = buildWhatsAppOrderUrl({
      businessWhatsapp: settings.whatsapp_number,
      orderNumber: createdOrder.order_number,
      orderId: createdOrder.id,
      customerName: input.customerName,
      customerPhone: normalizedPhone,
      deliveryDate: input.deliveryDate,
      requestedTimeSlot: input.requestedTimeSlot,
      zoneName: geoCheck.zoneName,
      addressReference: input.addressReference,
      lat: input.lat,
      lng: input.lng,
      items: resolvedItems,
      subtotalUyu,
      discountPercent,
      discountAmountUyu,
      freeMealApplied,
      totalUyu,
      paymentMethod: input.paymentMethod,
      cashNeedsChange: input.cashNeedsChange,
      cashPaidWithUyu: input.cashPaidWithUyu,
      cashChangeUyu,
      appBaseUrl,
    });

    return NextResponse.json({
      requiresMercadoPago: false,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      whatsappUrl,
      trackingUrl: `/seguimiento/${createdOrder.id}`,
      customerReferralCode: customer.referral_code,
    });
  } catch (error) {
    console.error('POST /api/orders error:', error);
    return NextResponse.json(
      { error: 'Ocurrió un error procesando tu pedido.' },
      { status: 500 }
    );
  }
}
