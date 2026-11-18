import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Verificación estándar GET para Meta (Instagram / Facebook Graph Webhooks)
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === (process.env.SOCIAL_VERIFY_TOKEN || 'sabor_goo_verify')) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

    const incomingText =
      body?.message ||
      body?.entry?.at(0)?.changes?.at(0)?.value?.text ||
      body?.entry?.at(0)?.messaging?.at(0)?.message?.text ||
      '';

    const senderId =
      body?.senderId ||
      body?.entry?.at(0)?.messaging?.at(0)?.sender?.id ||
      'usuario_social';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vercel.app';

    if (incomingText) {
      const chatRes = await fetch(`${appUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: incomingText }),
      });

      const chatData = chatRes.ok ? await chatRes.json() : null;
      const aiReply =
        chatData?.reply ||
        `¡Hola! En Sabor Goo servimos platos caseros muy abundantes en todo Maldonado y Playa Mansa (Paradas 1 a 25). Reservá tu vianda antes de las 21:00 hs acá: ${appUrl}`;

      const finalMessage = `${aiReply}\n\nPedí directo sin contraseña acá: ${appUrl}`;

      await supabase.from('engine_logs').insert({
        engine_name: 'Motor 2 · Escucha Social 24/7',
        mode: 'realtime_webhook',
        action_summary: `Respuesta instantánea enviada a ${senderId} ante consulta: "${String(incomingText).slice(0, 60)}"`,
        metadata: { senderId, finalMessage },
      });

      return NextResponse.json({ replied: true, reply: finalMessage });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Social webhook error:', error);
    return NextResponse.json({ error: 'Error webhook social' }, { status: 500 });
  }
}
