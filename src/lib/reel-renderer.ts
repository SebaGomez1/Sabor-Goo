import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, spawnSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { getSupabaseAdmin } from '@/lib/supabase';

export interface MenuForReel {
  id?: string | number;
  title: string;
  description?: string | null;
  price_uyu?: number | string | null;
  image_url?: string | null;
}

function buildDynamicHook(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('chivito')) return '¿Tenés ganas de un buen chivito el día de hoy?';
  if (t.includes('pizza') || t.includes('muzza') || t.includes('fugazzeta')) return '¿Tenés ganas de una buena pizza el día de hoy?';
  if (t.includes('hamburguesa') || t.includes('burger')) return '¿Tenés ganas de una buena hamburguesa el día de hoy?';
  if (t.includes('milanesa') || t.includes('napolitana')) return '¿Tenés ganas de una buena milanesa el día de hoy?';
  if (t.includes('empanada')) return '¿Tenés ganas de unas buenas empanadas el día de hoy?';
  return '¿Tenés ganas de comer algo bien rico el día de hoy?';
}

export async function renderMenuReelVideo(menu: MenuForReel, appBaseUrl: string): Promise<{ videoUrl: string; scriptText: string }> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sabor-reel-'));
  try {
    const rawImg = menu.image_url || '/menus/chivito-pan.jpg';
    const imgUrl = rawImg.startsWith('http') ? rawImg : `${appBaseUrl.replace(/\/$/, '')}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
    const imgPath = path.join(workDir, 'dish.jpg');
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) throw new Error(`No se pudo descargar imagen: ${imgUrl}`);
    fs.writeFileSync(imgPath, Buffer.from(await imgRes.arrayBuffer()));

    const cleanDesc = (menu.description || 'Preparado al momento con ingredientes frescos').trim();
    const descSents = cleanDesc.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const priceStr = menu.price_uyu ? String(menu.price_uyu) : '';
    const sents = [
      buildDynamicHook(menu.title),
      'Mirá esto.',
      `En Sabor Goo, te traemos ${menu.title}:`,
      ...descSents,
      ...(priceStr ? [`Por solo ${priceStr} pesos.`] : []),
      '¡Entrá ya a nuestra web y pedilo ahora!',
    ];
    const scriptText = sents.join(' ');
    const ffmpeg = ffmpegPath || 'ffmpeg';
    const fontFile = path.resolve(process.cwd(), 'public/fonts/impact.ttf').replace(/\\/g, '/').replace(':', '\\:');

    const words: { text: string; disp: string; start: number; end: number }[] = [];
    let cursor = 0;
    const concatList: string[] = [];

    for (let si = 0; si < sents.length; si++) {
      const sub = path.join(workDir, `s${si}`);
      fs.mkdirSync(sub, { recursive: true });
      const tts = new MsEdgeTTS();
      await tts.setMetadata('es-ES-AlvaroNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const spoken = sents[si].replace(/Sabor\s*Goo/gi, 'Sabor Gou');
      const { audioFilePath } = await tts.toFile(sub, spoken, { rate: '-8%', pitch: '+4Hz' });
      const trimPath = path.join(sub, 'trim.mp3').replace(/\\/g, '/');
      execFileSync(ffmpeg, ['-y', '-i', audioFilePath, '-af', 'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-40dB:stop_periods=-1:stop_duration=0.35:stop_threshold=-40dB', trimPath]);
      const probe = spawnSync(ffmpeg, ['-i', trimPath], { encoding: 'utf8' }).stderr || '';
      const m = probe.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      const dur = m ? (+m.at(1)*3600 + +m.at(2)*60 + +m.at(3)) : 1.8;
      const ws = sents[si].split(/\s+/).filter(Boolean);
      const syl = (w: string) => (/^\d+$/.test(w) ? 5 : Math.max(2, w.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '').length)) + (w.endsWith(',') ? 2 : 0);
      const totC = ws.reduce((a, w) => a + syl(w), 0);
      let cur = cursor;
      const tailTrim = si >= sents.length - 2 ? 0.42 : 0.25;
      const span = Math.max(0.25, dur - tailTrim);
      ws.forEach((w) => {
        const d = (syl(w) / totC) * span;
        const disp = w.toUpperCase().replace(/^PESOS/, '$');
        words.push({ text: w, disp, start: cur, end: cur + d });
        cur += d;
      });
      cursor += dur;
      concatList.push(`file '${trimPath}'`);
    }

    const listPath = path.join(workDir, 'list.txt');
    const fullAudioPath = path.join(workDir, 'full.mp3');
    fs.writeFileSync(listPath, concatList.join('\n'));
    execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-q:a', '2', fullAudioPath]);

    const lines: typeof words[] = [];
    let curLine: typeof words = [];
    words.forEach((w) => {
      const curLen = curLine.map((x) => x.disp).join(' ').length;
      if (curLen + w.disp.length > 18 && curLine.length > 0) { lines.push(curLine); curLine = []; }
      curLine.push(w);
    });
    if (curLine.length) lines.push(curLine);

    const blocks: typeof lines[] = [];
    for (let i = 0; i < lines.length; i += 3) blocks.push(lines.slice(i, i + 3));

    const filters: string[] = [
      'scale=1080:720:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:460:color=#0B0F19',
      `drawtext=fontfile='${fontFile}':text='SABOR GOO':fontcolor=#FACC15:borderw=5:bordercolor=#000000:fontsize=115:x=(w-text_w)/2:y=135`,
      `drawtext=fontfile='${fontFile}':text='MALDONADO':fontcolor=#FFFFFF:borderw=4:bordercolor=#000000:fontsize=56:x=(w-text_w)/2:y=270`,
    ];

    blocks.forEach((blk, bi) => {
      const nextBlk = blocks[bi + 1];
      const endT = nextBlk ? nextBlk.at(0).at(0).start : cursor;
      blk.forEach((lineWords, li) => {
        const baseY = 1330 + li * 185;
        const charW = 35;
        const lineStr = lineWords.map((x) => x.disp).join(' ');
        let x = Math.max(40, Math.round((1080 - lineStr.length * charW) / 2));
        lineWords.forEach((wo, idx) => {
          const fn = path.join(workDir, `w_${bi}_${li}_${idx}.txt`).replace(/\\/g, '/').replace(':', '\\:');
          fs.writeFileSync(path.join(workDir, `w_${bi}_${li}_${idx}.txt`), wo.disp);
          const col = idx % 2 === 0 ? '#FFFFFF' : '#FACC15';
          const popEnd = (wo.start + 0.06).toFixed(3);
          filters.push(`drawtext=fontfile='${fontFile}':textfile='${fn}':fontcolor=${col}:borderw=6:bordercolor=#000000:fontsize='if(lt(t,${popEnd}),82,70)':x=${x}:y=${baseY}-ascent:enable='between(t,${wo.start.toFixed(3)},${endT.toFixed(3)})'`);
          x += (wo.disp.length + 1) * charW;
        });
      });
    });

    const outVideoPath = path.join(workDir, 'reel.mp4');
    execFileSync(ffmpeg, ['-y', '-loop', '1', '-i', imgPath, '-i', fullAudioPath, '-vf', filters.join(','), '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', outVideoPath]);

    const supabase = getSupabaseAdmin();
    await supabase.storage.createBucket('reels-videos', { public: true }).catch(() => null);
    const fileName = `reel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
    const videoBuffer = fs.readFileSync(outVideoPath);
    const { error: upErr } = await supabase.storage.from('reels-videos').upload(fileName, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('reels-videos').getPublicUrl(fileName);
    return { videoUrl: pub.publicUrl, scriptText };
  } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
}
