#!/usr/bin/env node
// render-video.mjs: renders index.html to an MP4 with burned-in subtitles.
//
// Each frame is stepped deterministically in headless Chromium at the native
// 320x180, upscaled 5x with nearest-neighbor (crisp pixels), and placed above a
// subtitle strip: 1920x1080 output, picture 1600x900, subtitles in the band below.
// Any OpenAI stills in frames/ are included automatically.
//
// Usage:
//   node render-video.mjs [out.mp4]
// Env:
//   FPS               default 24
//   LIMIT             render only the first N seconds (for quick tests)
//   FONT_DIR          folder with VT323-Regular.ttf for subtitles (falls back to DejaVu Sans Mono)
//   PLAYWRIGHT_PATH   module path if `playwright` isn't resolvable from here
// Needs ffmpeg built with libx264 and libass.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] || join(ROOT, 'spider-man-pixel-trilogy.mp4'));
const FPS = Number(process.env.FPS || 24);
const FONT_DIR = process.env.FONT_DIR && existsSync(join(process.env.FONT_DIR, 'VT323-Regular.ttf')) ? process.env.FONT_DIR : null;
const FONT = FONT_DIR ? 'VT323' : 'DejaVu Sans Mono';
const SUB_SIZE = FONT_DIR ? 58 : 40;
const BATCH = 48;

const pw = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const { chromium } = pw.default || pw;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(ROOT, 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

// ---- subtitles: one ASS event per cue, speaker in red, sound cues in blue italics
const cues = await page.evaluate(() => {
  const { SCENES } = window.__movie;
  const out = [];
  for (const s of SCENES) s.cues.forEach((st, k) => out.push({ st, en: k + 1 < s.cues.length ? s.cues[k + 1] : s.start + s.dur, text: s.lines[k] }));
  return out;
});
const total = await page.evaluate(() => window.__movie.TOTAL);
const ts = (s) => { const cs = Math.round(s * 100); const h = (cs / 360000) | 0, m = ((cs / 6000) | 0) % 60, sec = ((cs / 100) | 0) % 60, c = cs % 100; return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
const assEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
const fmt = (s) => {
  if (s[0] === '[') return `{\\i1\\c&HFFB29D&}${assEsc(s)}`;
  const m = s.match(/^([A-Z][A-Z0-9 .'()\-]*?):\s(.*)$/);
  return m ? `{\\c&H7A7AFF&}${assEsc(m[1])}:{\\c&HC2F4FF&} ${assEsc(m[2])}` : assEsc(s);
};
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,${FONT},${SUB_SIZE},&H00C2F4FF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,200,200,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${cues.map((q) => `Dialogue: 0,${ts(q.st)},${ts(q.en)},Sub,,0,0,0,,${fmt(q.text)}`).join('\n')}
`;
const work = mkdtempSync(join(tmpdir(), 'spidey-'));
const assPath = join(work, 'subs.ass');
writeFileSync(assPath, ass);
const srt = (s) => { const ms = Math.round(s * 1000); return `${String((ms / 3600000) | 0).padStart(2, '0')}:${String(((ms / 60000) | 0) % 60).padStart(2, '0')}:${String(((ms / 1000) | 0) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
writeFileSync(OUT.replace(/\.mp4$/, '') + '.srt', cues.map((q, i) => `${i + 1}\n${srt(q.st)} --> ${srt(q.en)}\n${q.text}\n`).join('\n'));

// ---- video
const vf = [
  'scale=1600:900:flags=neighbor',
  'pad=1920:1080:160:0:black',
  `subtitles=${assPath}${FONT_DIR ? `:fontsdir=${FONT_DIR}` : ''}`,
  'format=yuv420p',
].join(',');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '320x180', '-r', String(FPS), '-i', '-',
  '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'animation', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (code) => (code ? rej(new Error('ffmpeg exited ' + code)) : res())));

const frames = Math.round(Math.min(total, Number(process.env.LIMIT) || total) * FPS);
const t0 = Date.now();
for (let f = 0; f < frames; f += BATCH) {
  const n = Math.min(BATCH, frames - f);
  const b64 = await page.evaluate(([f, n, fps]) => {
    const M = window.__movie, cv = document.getElementById('cv'), c = cv.getContext('2d');
    const buf = new Uint8Array(320 * 180 * 4 * n);
    for (let k = 0; k < n; k++) { M.seek((f + k) / fps); M.render(); buf.set(c.getImageData(0, 0, 320, 180).data, k * 320 * 180 * 4); }
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [f, n, FPS]);
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f / BATCH) % 25 === 0) process.stdout.write(`\r${((f / frames) * 100).toFixed(0)}%  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`\nwrote ${OUT} (${frames} frames @ ${FPS}fps)`);
