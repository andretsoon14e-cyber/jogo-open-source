#!/usr/bin/env node
/* Banco separado para não reencodar os demais sons do jogo.
 * Fontes e licenças: public/audio/CREDITOS.md.
 * TOOL_SOURCE_ROOT=/pasta/fontes FFMPEG=/caminho/ffmpeg node scripts/build-tool-sound-bank.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const root = process.env.TOOL_SOURCE_ROOT;
if (!root) throw new Error("Defina TOOL_SOURCE_ROOT com a pasta das amostras descritas em public/audio/CREDITOS.md.");
const rate = 32000;
const files = [
  ["axeSwing1", "swish-8.wav"], ["axeSwing2", "swish-9.wav"],
  ["pickSwing1", "pick-swing-2.ogg"], ["pickSwing2", "pick-swing-3.ogg"],
  ["swordSwing1", "swish-1.wav"], ["swordSwing2", "swish-3.wav"],
  ["axeHit1", "axe-hit-1.wav"], ["axeHit2", "axe-hit-2.wav"],
  ["pickStone1", "pick-stone.ogg"], ["pickStone2", "pick-stone-2.ogg"],
  ["pickMetal1", "pick-metal.ogg"], ["pickCrystal1", "pick-crystal.ogg"],
];

function run(args, options = {}) {
  const result = spawnSync(ffmpeg, args, { maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`FFmpeg falhou: ${result.error || result.stderr?.toString()}`);
  return result.stdout;
}

const chunks = [], cues = {}; let size = 0;
for (const [name, file] of files) {
  const raw = run(["-v", "error", "-i", join(root, file), "-ar", String(rate), "-ac", "1", "-f", "f32le", "pipe:1"]);
  const bytes = Uint8Array.from(raw), samples = new Float32Array(bytes.buffer);
  let first = 0, last = samples.length;
  while (first < last && Math.abs(samples[first]) < 0.0015) first++;
  while (last > first && Math.abs(samples[last - 1]) < 0.0015) last--;
  first = Math.max(0, first - Math.round(rate * 0.012));
  last = Math.min(samples.length, last + Math.round(rate * 0.03));
  const length = last - first;
  if (length <= 0) throw new Error(`Amostra vazia: ${file}`);
  let peak = 0;
  for (let i = first; i < last; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = Math.min(6, 0.76 / Math.max(peak, 0.0001));
  const clip = new Float32Array(length + Math.round(rate * 0.12));
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, i / (rate * 0.006), (length - i) / (rate * 0.03));
    clip[i] = samples[first + i] * gain * fade;
  }
  cues[name] = [Number((size / rate).toFixed(6)), Number((length / rate).toFixed(6))];
  chunks.push(clip); size += clip.length;
}
const sprite = new Float32Array(size); let offset = 0;
for (const clip of chunks) { sprite.set(clip, offset); offset += clip.length; }
mkdirSync("public/audio", { recursive: true });
run(["-v", "error", "-y", "-f", "f32le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", "public/audio/tool-effects.mp3"], {
  input: Buffer.from(sprite.buffer),
});
writeFileSync("src/game/tool-audio-cues.generated.json", JSON.stringify(cues, null, 2) + "\n");
console.log(`Ferramentas: ${files.length} fatias, ${(size / rate).toFixed(1)} s.`);
