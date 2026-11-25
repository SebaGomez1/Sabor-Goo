import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getMontevideoNow } from '@/lib/logistics';

const FALLBACK_MENU = [
  '- Chivito al pan para 1 ($360 UYU): Churrasco tierno, jamÃ³n, muzzarella, panceta, huevo, lechuga, tomate, mayonesa casera y papas fritas.',
  '- Chivito al plato para 1 ($420 UYU): PorciÃ³n abundante al plato con churrasco, jamÃ³n, queso, panceta, huevo, guarniciÃ³n completa y fritas.',
  '- Hamburguesa especial de carne picada ($320 UYU): Carne 100% vacuna casera, cheddar/muzzarella, panceta crocante, huevo y papas.',
  '- Napolitana para 1 ($390 UYU): Milanesa casera cubierta con salsa de tomate, jamÃ³n, muzzarella gratinada y guarniciÃ³n abundante.',
  '- Hamburguesa clÃ¡sica con carne picada ($260 UYU): Carne casera jugosa, lechuga, tomate, mayonesa especial y papas fritas.'
].join('\n');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage = String(body?.message || '').trim();
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
    if (!userMessage) return NextResponse.json({ error: 'Escribe un mensaje.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: menus } = await supabase.from('menus').select('title, description, price_uyu, daily_stock').eq('is_active', true);
    const uyNow = getMontevideoNow();
    const menuSummary = (menus && menus.length > 0) ? menus.map((m) => `- ${m.title} ($${m.price_uyu} UYU): ${m.description}`).join('\n') : FALLBACK_MENU;

    const systemPrompt = `Eres el asistente inteligente de "Sabor Goo", una chiveterÃ­a con pedidos al instante en Maldonado y Playa Mansa (Punta del Este), Uruguay. Tu personalidad es cÃ¡lida, cercana, uruguaya, Ã¡gil y natural. Puedes conversar con total fluidez, inteligencia y coherencia sobre CUALQUIER tema de la vida (charla cotidiana, cultura, deportes, consejos, preguntas generales o lo que el usuario quiera hablar) y, cuando venga al caso, recomendar de forma natural nuestro menÃº de chiveterÃ­a al instante.\n\nHORA ACTUAL EN URUGUAY: ${String(uyNow.hour).padStart(2, '0')}:${String(uyNow.minute).padStart(2, '0')} hs.\n\nINFORMACIÃ“N REAL DEL NEGOCIO SABOR GOO:\n1. Modalidad: Todo nuestro menÃº se prepara EN EL MOMENTO (pedidos al instante, sin encargues del dÃ­a anterior).\n2. Cobertura geogrÃ¡fica: Repartimos en TODO Maldonado (cada barrio) y en Playa Mansa de Punta del Este desde Parada 1 hasta Parada 25 y su eje hacia Maldonado.\n3. Pedido rÃ¡pido y tracking GPS: Sin registro ni contraseÃ±a. El cliente elige sus chivitos/hamburguesas/napolitanas, marca su punto GPS en el mapa, confirma por WhatsApp o paga con Mercado Pago, y recibe seguimiento GPS en vivo del repartidor hasta su puerta.\n4. Beneficios y Referidos vigentes:\n   - Racha de 3 dÃ­as seguidos comprando: desde el 4.Â° dÃ­a obtiene 25% OFF vitalicio mientras siga pidiendo a diario (sÃ¡bado y domingo no cortan racha; si falta 2 dÃ­as seguidos pierde el descuento).\n   - 5 referidos nuevos comprando en el mismo dÃ­a con su link Ãºnico = 25% OFF inmediato ese mismo dÃ­a.\n   - 10 referidos activos comprando a diario = 1 COMIDA GRATIS por dÃ­a (si baja a 9 conserva automÃ¡ticamente el 25% OFF).\n5. Privacidad del reparto: JAMÃS menciones "bici" ni "bicicleta". Habla siempre de "seguimiento en vivo del repartidor hasta tu puerta".\n\nMENÃš ACTUAL DE CHIVETERÃA (DISPONIBLE AL INSTANTE):\n${menuSummary}`;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (geminiKey) {
      const contents = [...history.map((h: { role: string; content: string }) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.content || '') }] })), { role: 'user', parts: [{ text: userMessage }] }];
      const gemRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.75, maxOutputTokens: 800 } })
      });
      if (!gemRes.ok) { const errTxt = await gemRes.text(); return NextResponse.json({ reply: 'DEBUG GEMINI (' + gemRes.status + '): ' + errTxt.slice(0,220) }); } if (gemRes.ok) {
        const data = await gemRes.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return NextResponse.json({ reply });
      }
    }

    const q = userMessage.toLowerCase();
    let reply = '';
    if (q.includes('menu') || q.includes('menÃº') || q.includes('precio') || q.includes('chivito') || q.includes('hamburguesa') || q.includes('comer')) {
      reply = `Â¡Tenemos todo listo para preparar **en el momento**!\n\n${menuSummary}\n\nElige lo que mÃ¡s te tiente arriba en el catÃ¡logo, marca tu punto GPS y te lo mandamos al instante.`;
    } else if (q.includes('zona') || q.includes('punta') || q.includes('mansa') || q.includes('envio') || q.includes('envÃ­o') || q.includes('reparto')) {
      reply = 'Llegamos al instante a **todo Maldonado** y **Playa Mansa (Parada 1 a 25)**. AdemÃ¡s cuentas con **seguimiento GPS en vivo del repartidor** hasta tu puerta.';
    } else if (q.includes('gratis') || q.includes('descuento') || q.includes('referido') || q.includes('racha')) {
      reply = 'Tenemos 3 beneficios activos:\nâ€¢ **3 dÃ­as seguidos** pidiendo = **25% OFF** desde el 4.Â° dÃ­a.\nâ€¢ **5 referidos** en el dÃ­a con tu link = **25% OFF** inmediato.\nâ€¢ **10 referidos activos** = **1 comida GRATIS por dÃ­a**.';
    } else {
      reply = 'Â¡Hola! Soy el asistente de **Sabor Goo** en Maldonado. PregÃºntame lo que quieras sobre nuestros chivitos, hamburguesas, napolitanas, zonas de envÃ­o o beneficios de referidos.';
    }
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('POST /api/chat error:', error);
    return NextResponse.json({ error: 'No se pudo procesar tu consulta en este momento.' }, { status: 500 });
  }
}








