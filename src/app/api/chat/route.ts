import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveNextBookingWindow, getMontevideoNow } from '@/lib/logistics';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage = String(body?.message || '').trim();
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];

    if (!userMessage) {
      return NextResponse.json({ error: 'Escribe un mensaje.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const [{ data: menus }, { data: settings }] = await Promise.all([
      supabase
        .from('menus')
        .select('day_label, title, description, price_uyu, daily_stock')
        .eq('is_active', true)
        .order('day_of_week', { ascending: true }),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    const booking = resolveNextBookingWindow(settings?.cutoff_hour ?? 21);
    const uyNow = getMontevideoNow();

    const menuSummary = (menus || [])
      .map(
        (m) =>
          `- ${m.day_label}: ${m.title} ($${m.price_uyu} UYU, stock disponible: ${m.daily_stock}). ${m.description}`
      )
      .join('\n');

    const systemPrompt = `Eres el asistente oficial de "Sabor Goo" en Maldonado, Uruguay.
Tu personalidad es cálida, cercana, uruguaya, rápida y persuasiva, pero también puedes charlar con fluidez sobre cualquier tema de la vida, deportes, clima, trabajo o actualidad para generar confianza y luego invitar sutilmente a asegurar su almuerzo abundante antes de las 21:00 hs.

REGLAS ESTRICTAS DEL NEGOCIO SABOR GOO:
1. Sello de Abundancia: Todos nuestros platos son 100% caseros, muy bien servidos, abundantes y contundentes, sin escatimar.
2. Cobertura geográfica exclusiva: Repartimos en TODO Maldonado (cada barrio) y en Playa Mansa de Punta del Este EXCLUSIVAMENTE desde Parada 1 hasta Parada 25 y su eje hacia Maldonado. Fuera de esa zona no tomamos pedidos.
3. Horarios y cierre: Atendemos de Lunes a Viernes al mediodía. El cierre de reservas es a las 21:00 hs (hora Uruguay, ahora son las ${String(uyNow.hour).padStart(2, '0')}:${String(uyNow.minute).padStart(2, '0')} hs). Próxima entrega disponible: ${booking.targetDayLabel}. Fines de semana cerrado, pero se puede reservar anticipado para el Lunes.
4. Sin registro con contraseña: El cliente solo completa su pedido con nombre, celular, ubicación en el mapa y confirma por WhatsApp (o paga con Mercado Pago).
5. Beneficios y Gamificación:
   - Racha de 3 días hábiles seguidos comprando = desde el 4.º día obtiene 25% OFF vitalicio mientras siga comprando a diario (sábado y domingo no cortan racha; si falta 2 días hábiles seguidos pierde el descuento).
   - 5 referidos nuevos comprando en el mismo día con su link único = 25% OFF inmediato ese mismo día.
   - 10 referidos activos comprando a diario = 1 COMIDA GRATIS por día. Si baja a 9 conserva automáticamente el 25% OFF.
6. REGLA CRÍTICA DE PRIVACIDAD: JAMÁS menciones "bici" ni "bicicleta". Siempre habla de "seguimiento en vivo del repartidor hasta tu puerta".

CATÁLOGO ACTUAL DE SABOR GOO:
${menuSummary}`;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map((h: { role: string; content: string }) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content || ''),
        })),
        { role: 'user', content: userMessage },
      ];

      const aiRes = await fetch('https://openai.com', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 450,
        }),
      });

      if (aiRes.ok) {
        const data = await aiRes.json();
        const reply = data?.choices?.at(0)?.message?.content;
        if (reply) {
          return NextResponse.json({ reply });
        }
      }
    }

    // Respuesta inteligente de respaldo con datos en tiempo real de Supabase
    const q = userMessage.toLowerCase();
    let reply = '';

    if (q.includes('menu') || q.includes('menú') || q.includes('precio') || q.includes('comida') || q.includes('hoy')) {
      reply = `¡Hola! En **Sabor Goo** cocinamos platos caseros, muy bien servidos y abundantes sin escatimar. Para **${booking.targetDayLabel}** tenemos opciones desde **$220 a $400 UYU**:\n\n${menuSummary}\n\nRecuerda reservar antes de las **21:00 hs** para asegurar tu bandeja.`;
    } else if (q.includes('zona') || q.includes('punta') || q.includes('mansa') || q.includes('envio') || q.includes('reparto')) {
      reply = `Llegamos a **todo Maldonado** (cada barrio) y a **Playa Mansa de Punta del Este desde Parada 1 hasta Parada 25** y todo su eje hacia Maldonado. Además tienes **seguimiento en vivo del repartidor** hasta que llega a tu puerta.`;
    } else if (q.includes('gratis') || q.includes('descuento') || q.includes('referido') || q.includes('racha')) {
      reply = `¡Tenemos 3 beneficios brutales para trabajadores y equipos!\n• **3 días hábiles seguidos** comprando = **25% OFF** desde el 4.º día.\n• **5 referidos en el mismo día** con tu link = **25% OFF inmediato**.\n• **10 referidos activos diarios** = **1 comida GRATIS todos los días** (y si bajas a 9, conservas tu 25% OFF).`;
    } else {
      reply = `¡Qué bueno saludarte! Aquí en Maldonado seguimos a full preparando viandas caseras y abundantes de verdad (bandejas bien servidas que te dejan listo para seguir el día). Si quieres, dime en qué barrio o parada estás y te cuento qué sale para **${booking.targetDayLabel}** antes del cierre de las **21:00 hs**.`;
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('POST /api/chat error:', error);
    return NextResponse.json(
      { error: 'No se pudo procesar tu consulta en este momento.' },
      { status: 500 }
    );
  }
}
