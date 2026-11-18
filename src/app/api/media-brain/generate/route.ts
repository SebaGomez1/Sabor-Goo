import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyCronSecret, getAdminFromRequest } from '@/lib/auth';
import { resolveNextBookingWindow } from '@/lib/logistics';

function buildHumanVoiceSsml(plainText: string): string {
  const escaped = plainText
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

    const [{ data: menus }, { data: settings }] = await Promise.all([
      supabase
        .from('menus')
        .select('day_label, title, price_uyu, description')
        .eq('is_active', true)
        .order('day_of_week', { ascending: true }),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
    ]);

    const booking = resolveNextBookingWindow(settings?.cutoff_hour ?? 21);
    const featuredMenu =
      menus?.find((m) => m.day_label.toLowerCase().startsWith(booking.targetDayLabel.slice(0, 5).toLowerCase())) ||
      menus?.at(0);

    const audiences = [
      'Trabajadores de obras y construcción en Maldonado y Playa Mansa',
      'Equipos de oficinas, comercios y estudios en Maldonado Centro',
      'Personal de sanatorios, hospitales y clínicas de Maldonado',
    ];
    const targetAudience =
      body.targetAudience || audiences[Math.floor(Math.random() * audiences.length)];

    let scriptText = '';
    const openaiKey = process.env.OPENAI_API_KEY;

    if (openaiKey) {
      const prompt = `Escribe un guion corto de 25 segundos para un Reel vertical (TikTok/Instagram) de "Sabor Goo" en Maldonado, Uruguay.
Público objetivo: ${targetAudience}.
Plato destacado: ${featuredMenu?.title || 'Menú Casero Abundante'} a $${featuredMenu?.price_uyu || 300} UYU.
Incluye obligatoriamente estos puntos con tono uruguayo natural, cercano y enérgico:
1. Bandejas caseras muy bien servidas, abundantes y contundentes, sin escatimar.
2. Si comprás 3 días hábiles seguidos tenés 25% OFF desde el cuarto día.
3. Si juntás 10 compañeros de obra, oficina o sanatorio con tu link, comés GRATIS todos los días.
4. Reparto en todo Maldonado y Playa Mansa Paradas 1 a 25 con seguimiento en vivo del repartidor.
5. Reserva antes de las 21:00 hs.
PROHIBIDO mencionar la palabra bici o bicicleta. Devuelve SOLO el texto hablado, sin acotaciones entre paréntesis.`;

      const res = await fetch('https://openai.com', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.75,
          max_tokens: 260,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        scriptText = json?.choices?.at(0)?.message?.content?.trim() || '';
      }
    }

    if (!scriptText) {
      scriptText = `¿Laburando a full en Maldonado y cansado de viandas chicas que te dejan con hambre? En Sabor Goo servimos platos caseros abundantes de verdad, bandeja llena sin escatimar. Probá nuestro ${featuredMenu?.title || 'menú casero del día'} por solo $${featuredMenu?.price_uyu || 300} pesos. Además, si pedís 3 días seguidos tenés 25% de descuento desde el cuarto día, y si compartís tu link con 10 compañeros de obra, oficina o sanatorio, ¡tu comida diaria te sale totalmente gratis! Llegamos a todo Maldonado y Playa Mansa de Parada 1 a 25 con seguimiento en vivo del repartidor hasta tu puerta. Entrá ya y reservá antes de las 9 de la noche.`;
    }

    const voiceoverSsml = buildHumanVoiceSsml(scriptText);
    const subtitlesJson = buildDynamicSubtitles(scriptText);
    const videoPrompt = `Vertical 9:16 HD gastronomic close-up shot of generous homemade Uruguayan meal (${featuredMenu?.title || 'Milanesa Napolitana XXL'}), steaming hot, golden crispy textures, natural daylight, high appetite appeal, Maldonado Uruguay.`;

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
