import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    let text = sp.get('text') || '';
    const reelId = sp.get('reelId');
    if (!text && reelId) {
      const db = getSupabaseAdmin();
      const { data } = await db.from('media_reels_queue').select('script_text').eq('id', reelId).single();
      text = data?.script_text || '';
    }
    if (!text) {
      return NextResponse.json({ error: 'Falta texto' }, { status: 400 });
    }
    const voice = sp.get('voice') || 'es-ES-AlvaroNeural';
    const spokenText = text
      .replace(/Sabor\s*Goo/gi, 'Sabor Gou')
      .replace(/! /g, '!... ')
      .replace(/\.\.\./g, '... ');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(spokenText, { rate: '+11%', pitch: '+5Hz' });
    const chunks: Buffer[] = [];
    for await (const c of audioStream) chunks.push(c);
    return new NextResponse(Buffer.concat(chunks), {
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
