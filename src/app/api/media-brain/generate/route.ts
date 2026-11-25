import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret, getAdminFromRequest } from '@/lib/auth';

function buildHumanVoiceSsml(plaintext: string): string {
  const escaped = plaintext
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\. /g, '. <break time="380ms"/> ')
    .replace(/, /g, ', <break time="200ms"/> ')
    .replace(/! /g, '! <break time="320ms"/> ');

  return `<speak><prosody rate="98%" pitch="+1st">${escaped}</prosody></speak>`;
}

function buildDynamicSubtitles(script: string) {
  const words = script.split(/\s+/).filter(Boolean);
  const chunks: Array<{ startSec: number; endSec: number; text: string }> = [];
  let cursor = 0;

  for (let i = 0; i < words.length; i += 4) {
    const slice = words.slice(i, i + 4).join(' ');
    const duration = Number((slice.length * 0.065 + 0.45).toFixed(2));
    chunks.push({
      startSec: Number(cursor.toFixed(2)),
      endSec: Number((cursor + duration).toFixed(2)),
      text: slice.toUpperCase(),
    });
    cursor += duration;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const isAuthorized = verifyCronSecret(req) || Boolean(getAdminFromRequest(req));
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

    const { data: menus } = await supabase
      .from('menus')
      .select('id, title, price_uyu, description, image_url')
      .eq('is_active', true);

    const activeMenus = menus || [];
    const featuredMenu =
      (body.menuId ? activeMenus.find((m) => m.id === body.menuId) : null) ||
      (activeMenus.length > 0
        ? activeMenus[Math.floor(Math.random() * activeMenus.length)]
        : null);

    const productTitle = featuredMenu?.title || 'Chivito Completo de la Casa';
    const productPrice = featuredMenu?.price_uyu || 450;
    const productDesc =
      featuredMenu?.description ||
      'Carne tierna a la plancha, jamÃ³n, muzzarella fundida, panceta crocante, huevo, lechuga, tomate y papas fritas.';

    const audiences = [
      'Amantes de los buenos chivitos en Maldonado y Punta del Este',
      'Juntadas con amigos, parejas y familias con ganas de comer rico al instante',
      'Vecinos y turistas en Maldonado y Playa Mansa buscando chiveterÃ­a artesanal',
    ];
    const targetAudience =
      body.targetAudience || audiences[Math.floor(Math.random() * audiences.length)];

    let scriptText = '';
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (geminiKey) {
      const prompt = `Escribe un guion corto de 25 segundos para un Reel vertical (TikTok/Instagram) de la chiveterÃ­a "Sabor Goo" en Maldonado, Uruguay.
PÃºblico objetivo: ${targetAudience}.
Producto destacado real del menÃº: "${productTitle}" a $${productPrice} UYU.
DescripciÃ³n real del producto: ${productDesc}.
Incluye obligatoriamente estos puntos con tono uruguayo natural, cercano y tentador:
1. Pedidos al instante: lo pedÃ­s ahora y te llega calentito directo a tu puerta, sin esperar al otro dÃ­a.
2. Menciona el nombre exacto "${productTitle}", su precio de $${productPrice} pesos y sus ingredientes reales.
3. Si pedÃ­s 3 dÃ­as seguidos tenÃ©s 25% OFF desde el cuarto dÃ­a.
4. 4. Mientras mantengas 10 referidos activos comprando con tu link (en el dÃ­a o a diario), comÃ©s GRATIS (y si bajÃ¡s a 9 activos, seguÃ­s disfrutando el 25% OFF por compra diaria).
5. Reparto en todo Maldonado y Playa Mansa Paradas 1 a 25 con seguimiento en vivo del repartidor.
PROHIBIDO mencionar viandas, encargues del dÃ­a anterior, ni las palabras bici o bicicleta. Devuelve SOLO el texto hablado, sin acotaciones entre parÃ©ntesis.`;

      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey, {
        method: 'POST',
        headers: {
                    'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 260 }
          
        }),
      });

      if (res.ok) {
        const json = await res.json();
        scriptText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      }
    }

    if (!scriptText) {
     scriptText = `Â¿Antojo de un verdadero chivito uruguayo en Maldonado? Pedilo ahora en Sabor Goo y te lo llevamos calentito al instante. ProbÃ¡ nuestro ${productTitle}: ${productDesc}, por solo $${productPrice} pesos. AdemÃ¡s, si pedÃ­s 3 dÃ­as seguidos tenÃ©s 25% de descuento desde el cuarto dÃ­a, y mientras mantengas 10 referidos activos comprando con tu link en el dÃ­a o a diario, Â¡tu pedido te sale totalmente gratis! (Y si bajÃ¡s a 9 activos, mantenÃ©s tu 25% OFF por compra diaria). Llegamos a todo Maldonado y Playa Mansa de Parada 1 a 25 con seguimiento en vivo del repartidor hasta tu puerta. Â¡EntrÃ¡ ya y pedÃ­ el tuyo ahora mismo!`;
    }

    const voiceoverSsml = buildHumanVoiceSsml(scriptText);
    const subtitlesJson = buildDynamicSubtitles(scriptText);
    const videoPrompt = featuredMenu?.image_url
      ? `Vertical 9:16 HD gastronomic motion reel based on real menu photo (${featuredMenu.image_url}) of "${productTitle}" ($${productPrice} UYU): ${productDesc}, steaming hot, melted cheese, crispy fries, Maldonado Uruguay.`
      : `Vertical 9:16 HD gastronomic close-up shot of authentic Uruguayan chivito "${productTitle}" ($${productPrice} UYU), ${productDesc}, steaming hot, melted mozzarella, crispy fries, Maldonado Uruguay.`;

    const { data: reel, error } = await supabase
      .from('media_reels_queue')
      .insert({
        target_audience: targetAudience,
        script_text: scriptText,
        voiceover_ssml: voiceoverSsml,
        subtitles_json: subtitlesJson,
        video_prompt: videoPrompt,
        network: 'all',
        status: 'ready',
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Error guardando guion multimedia.' }, { status: 500 });
    }

    return NextResponse.json({ generated: true, reel });
  } catch (error) {
    console.error('Media brain error:', error);
    return NextResponse.json({ error: 'Error en Cerebro Multimedia.' }, { status: 500 });
  }
}






