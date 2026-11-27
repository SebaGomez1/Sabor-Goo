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
    if (!text) return NextResponse.json({ error: 'Falta texto' }, { status: 400 });
    const voice = sp.get('voice') || 'es-ES-AlvaroNeural';
    const spokenText = text.replace(/Sabor\s*Goo/gi, 'Sabor Gou').replace(/! /g, '!... ').replace(/\.\.\./g, '... ');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = await tts.toStream(spokenText, { rate: '+11%', pitch: '+5Hz' });
    const chunks: Buffer[] = [];
    const words: { text: string; start: number; end: number }[] = [];
    if (metadataStream) {
      metadataStream.on('data', (m: Buffer) => {
        try {
          const j = JSON.parse(m.toString());
          for (const item of j.Metadata || []) {
            if (item.Type === 'WordBoundary') {
              const start = item.Data.Offset / 10000000;
              const end = start + item.Data.Duration / 10000000;
              words.push({ text: item.Data.text.replace(/Sabor\s*Gou/gi, 'Sabor Goo'), start, end });
            }
          }
        } catch {}
      });
    }
    for await (const c of audioStream) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (sp.get('format') === 'json') {
      return NextResponse.json({ audioBase64: buf.toString('base64'), words });
    }
    return new NextResponse(buf, { headers: { 'Content-Type': 'audio/mpeg' } });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
