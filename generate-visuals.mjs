#!/usr/bin/env node
// generate-visuals.mjs: renders one OpenAI image per scene into frames/NN.png.
//
// index.html picks these up automatically: a scene that has a still shows it (downscaled
// to 320x180 so it reads as pixel art, with a slow pan); a scene without one falls back
// to the hand-drawn procedural pixel art.
//
// Usage:
//   OPENAI_API_KEY=... node generate-visuals.mjs                 # every missing frame
//   OPENAI_API_KEY=... node generate-visuals.mjs --only 3,15,30  # specific scenes
//   OPENAI_API_KEY=... node generate-visuals.mjs --force         # regenerate existing
//   node generate-visuals.mjs --dry-run                          # print prompts, no API calls
//
// Env:
//   OPENAI_API_KEY   required unless --dry-run
//   OPENAI_IMAGE_MODEL   default gpt-image-1
//   OPENAI_IMAGE_QUALITY low | medium | high (default low: cheapest, and it gets
//                        downscaled to 320x180 anyway)
//   CONCURRENCY          parallel requests (default 3)
//
// Character names are swapped for plain descriptions before sending, because image
// models commonly refuse trademarked character names. A scene that is still refused
// is logged and skipped; the movie keeps its procedural pixel art for that scene.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'frames');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

// ---- load scene list straight from index.html, so prompts never drift from the movie
function loadScenes() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const noop = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
  const el = () => ({ getContext: () => noop, appendChild() {}, classList: { toggle() {} }, style: {}, set textContent(v) {}, set innerHTML(v) {} });
  const window = {};
  const ctx = {
    window, console, Math, String, Object, Number, Array, JSON, parseInt,
    document: { getElementById: el, createElement: el, addEventListener() {}, fullscreenElement: null },
    Image: class { set src(v) {} },
    requestAnimationFrame() {},
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.__movie.SCENES;
}

const FILM_NAMES = ['first film (2002)', 'second film (2004)', 'third film (2007)'];
const SUBS = [
  [/black-suit Spidey/gi, 'the masked hero, now in a sleek black suit with a white spider emblem,'],
  [/Spider-Man|Spidey/gi, 'a masked hero in a red-and-blue web-patterned bodysuit'],
  [/NEW GOBLIN|Green Goblin|GREEN GOBLIN|GOBLIN|Goblin/g, 'a villain in green armor riding a bat-winged hover glider'],
  [/DOC OCK|Doc Ock|OTTO OCTAVIUS|OTTO|Otto/g, 'a scientist in a trenchcoat and round dark glasses with four giant mechanical tentacle arms'],
  [/VENOM|Venom/g, 'a hulking black goo monster with huge white eyes and fangs'],
  [/SANDMAN|Sandman|FLINT MARKO|Flint|Marko/g, 'a man made of living sand'],
  [/J\. JONAH JAMESON|JJJ/g, 'a shouting newspaper editor with a flat-top haircut and a cigar'],
  [/MJ|Mary Jane/g, 'a red-haired young woman'],
  [/PETER|Peter( Parker)?/g, 'a skinny young man with brown hair'],
];
const STYLE =
  '16-bit pixel art, retro video game cutscene, wide 16:9 cinematic composition, chunky visible pixels, ' +
  'limited palette, bold readable silhouettes, no text, no captions, no logos, no watermarks. ';

function promptFor(scene) {
  let story = scene.lines
    .map((l) => l.replace(/^([A-Z][A-Z0-9 .'()\-]*?):\s/, '$1 says: ').replace(/[\[\]]/g, ''))
    .join(' ');
  for (const [re, to] of SUBS) story = story.replace(re, to);
  return `${STYLE}A parody scene from a ${FILM_NAMES[scene.film]} superhero movie trilogy, retold as a goofy pixel cutscene. Depict this moment: ${story}`.slice(0, 3800);
}

async function generate(prompt, file) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size: '1536x1024',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'low',
      n: 1,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body?.error?.code || ''} ${body?.error?.message || ''}`.trim());
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('no image in response');
  writeFileSync(file, Buffer.from(b64, 'base64'));
}

const scenes = loadScenes();
const only = opt('--only')?.split(',').map(Number);
const jobs = scenes
  .map((s, i) => ({ i, s, file: join(OUT, String(i).padStart(2, '0') + '.png') }))
  .filter((j) => (!only || only.includes(j.i)) && (flag('--force') || !existsSync(j.file)));

if (flag('--dry-run')) {
  for (const j of jobs) console.log(`--- ${String(j.i).padStart(2, '0')}\n${promptFor(j.s)}\n`);
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. Add it to the environment, or use --dry-run to preview prompts.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
console.log(`${jobs.length} scene(s) to render`);

const failed = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await generate(promptFor(j.s), j.file);
        console.log(`ok   ${j.i}`);
        break;
      } catch (e) {
        const refused = /moderation|safety|content_policy|400/.test(e.message);
        if (refused || attempt === 3) { console.log(`skip ${j.i}: ${e.message}`); failed.push(j.i); break; }
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }
}
await Promise.all(Array.from({ length: Number(process.env.CONCURRENCY || 3) }, worker));
console.log(failed.length ? `done; ${failed.length} scene(s) keep procedural art: ${failed.join(',')}` : 'done');
