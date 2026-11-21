import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getMontevideoNow } from '@/lib/logistics';

const FALLBACK_MENU = [
  '- Chivito al pan para 1 ($360 UYU): Churrasco tierno, jamón, muzzarella, panceta, huevo, lechuga, tomate, mayonesa casera y papas fritas.',
  '- Chivito al plato para 1 ($420 UYU): Porción abundante al plato con churrasco, jamón, queso, panceta, huevo, guarnición completa y fritas.',
  '- Hamburguesa especial de carne picada ($320 UYU): Carne 100% vacuna casera, cheddar/muzzarella, panceta crocante, huevo y papas.',
  '- Napolitana para 1 ($390 UYU): Milanesa casera cubierta con salsa de tomate, jamón, muzzarella gratinada y guarnición abundante.',
  '- Hamburguesa clásica con carne picada ($260 UYU): Carne casera jugosa, lechuga, tomate, mayonesa especial y papas fritas.'
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

    const systemPrompt = `Eres el asistente inteligente de "Sabor Goo", una chivetería con pedidos al instante en Maldonado y Playa Mansa (Punta del Este), Uruguay. Tu personalidad es cálida, cercana, uruguaya, ágil y natural. Puedes conversar con total fluidez, inteligencia y coherencia sobre CUALQUIER tema de la vida (charla cotidiana, cultura, deportes, consejos, preguntas generales o lo que el usuario quiera hablar) y, cuando venga al caso, recomendar de forma natural nuestro menú de chivetería al instante.\n\nHORA ACTUAL EN URUGUAY: ${String(uyNow.hour).padStart(2, '0')}:${String(uyNow.minute).padStart(2, '0')} hs.\n\nINFORMACIÓN REAL DEL NEGOCIO SABOR GOO:\n1. Modalidad: Todo nuestro menú se prepara EN EL MOMENTO (pedidos al instante, sin encargues del día anterior).\n2. Cobertura geográfica: Repartimos en TODO Maldonado (cada barrio) y en Playa Mansa de Punta del Este desde Parada 1 hasta Parada 25 y su eje hacia Maldonado.\n3. Pedido rápido y tracking GPS: Sin registro ni contraseña. El cliente elige sus chivitos/hamburguesas/napolitanas, marca su punto GPS en el mapa, confirma por WhatsApp o paga con Mercado Pago, y recibe seguimiento GPS en vivo del repartidor hasta su puerta.\n4. Beneficios y Referidos vigentes:\n   - Racha de 3 días seguidos comprando: desde el 4.° día obtiene 25% OFF vitalicio mientras siga pidiendo a diario (sábado y domingo no cortan racha; si falta 2 días seguidos pierde el descuento).\n   - 5 referidos nuevos comprando en el mismo día con su link único = 25% OFF inmediato ese mismo día.\n   - 10 referidos activos comprando a diario = 1 COMIDA GRATIS por día (si baja a 9 conserva automáticamente el 25% OFF).\n5. Privacidad del reparto: JAMÁS menciones "bici" ni "bicicleta". Habla siempre de "seguimiento en vivo del repartidor hasta tu puerta".\n\nMENÚ ACTUAL DE CHIVETERÍA (DISPONIBLE AL INSTANTE):\n${menuSummary}`;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (geminiKey) {
      const contents = [...history.map((h: { role: string; content: string }) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.content || '') }] })), { role: 'user', parts: [{ text: userMessage }] }];
      const gemRes = await fetch('https://' + '://googleapis.com' + geminiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { temperature: 0.75, maxOutputTokens: 600 } })
      });
      if (gemRes.ok) {
        const data = await gemRes.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return NextResponse.json({ reply });
      }
    }

    const q = userMessage.toLowerCase();
    let reply = '';
    if (q.includes('menu') || q.includes('menú') || q.includes('precio') || q.includes('chivito') || q.includes('hamburguesa') || q.includes('comer')) {
      reply = `¡Tenemos todo listo para preparar **en el momento**!\n\n${menuSummary}\n\nElige lo que más te tiente arriba en el catálogo, marca tu punto GPS y te lo mandamos al instante.`;
    } else if (q.includes('zona') || q.includes('punta') || q.includes('mansa') || q.includes('envio') || q.includes('envío') || q.includes('reparto')) {
      reply = 'Llegamos al instante a **todo Maldonado** y **Playa Mansa (Parada 1 a 25)**. Además cuentas con **seguimiento GPS en vivo del repartidor** hasta tu puerta.';
    } else if (q.includes('gratis') || q.includes('descuento') || q.includes('referido') || q.includes('racha')) {
      reply = 'Tenemos 3 beneficios activos:\n• **3 días seguidos** pidiendo = **25% OFF** desde el 4.° día.\n• **5 referidos** en el día con tu link = **25% OFF** inmediato.\n• **10 referidos activos** = **1 comida GRATIS por día**.';
    } else {
      reply = '¡Hola! Soy el asistente de **Sabor Goo** en Maldonado. Pregúntame lo que quieras sobre nuestros chivitos, hamburguesas, napolitanas, zonas de envío o beneficios de referidos.';
    }
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('POST /api/chat error:', error);
    return NextResponse.json({ error: 'No se pudo procesar tu consulta en este momento.' }, { status: 500 });
  }
}
