#!/usr/bin/env node
/*
 * Quatro composições originais para Ilha da Última Luz.
 * Timbres: amostras CC0 Meta Piano e Meta Nylon Guitar; detalhes em
 * public/audio/CREDITOS.md. Requer Node, ffmpeg com libmp3lame e as oito
 * amostras originais identificadas no arquivo de créditos.
 *
 * AUDIO_SOURCES=/caminho/instruments FFMPEG=/caminho/ffmpeg node scripts/compose-music.mjs
 * Nenhuma música de terceiros é utilizada; notas, arranjos e síntese são daqui.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const root = process.env.AUDIO_SOURCES || "/home/user/audio-sources/instruments";
const out = "public/audio/music";
const rate = 32000;
mkdirSync(out, { recursive: true });

function decode(name) {
  const result = spawnSync(ffmpeg, ["-v", "error", "-i", join(root, name), "-ac", "1", "-ar", String(rate), "-f", "f32le", "pipe:1"], { maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Não foi possível decodificar ${name}: ${result.stderr}`);
  const copy = Uint8Array.from(result.stdout);
  return new Float32Array(copy.buffer);
}
const instruments = {
  piano: [[52, "piano_E3.ogg"], [60, "piano_C4.ogg"], [67, "piano_G4.ogg"], [72, "piano_C5.ogg"]].map(([midi, path]) => ({ midi, sample: decode(path) })),
  guitar: [[45, "guitar_A2.ogg"], [52, "guitar_E3.ogg"], [57, "guitar_A3.ogg"], [60, "guitar_C4.ogg"]].map(([midi, path]) => ({ midi, sample: decode(path) })),
};

// Cada linha da melodia é um compasso de 4 tempos. [tempo, nota MIDI, duração].
const lobbyMelody = [
  [[0,69,1.2],[1.5,74,0.7],[2.5,73,0.6],[3.3,69,0.6]],
  [[0,71,1.5],[2,66,0.7],[3,69,0.8]],
  [[0,67,1.1],[1.5,66,0.7],[2.5,64,1.3]],
  [[0.5,64,0.6],[1.5,66,0.7],[2.5,69,1.3]],
  [[0,74,1.2],[1.5,76,0.7],[2.5,78,1.1]],
  [[0,78,0.6],[1,76,0.6],[2,74,1.5]],
  [[0,73,0.8],[1,71,0.8],[2,69,0.9],[3,66,0.7]],
  [[0.5,64,0.7],[1.5,66,0.8],[2.5,62,1.3]],
  [[0,66,0.8],[1,69,0.8],[2,71,0.7],[3,74,0.7]],
  [[0,76,1.1],[1.5,74,0.8],[2.5,71,1.2]],
  [[0,69,0.7],[1,71,0.7],[2,74,1.6]],
  [[0,73,1.1],[1.5,69,0.8],[2.5,66,1.1]],
  [[0,67,1.1],[1.5,69,0.7],[2.5,71,1.1]],
  [[0,69,0.7],[1,66,0.7],[2,64,1.6]],
  [[0,66,0.7],[1,69,0.7],[2,73,0.8],[3,71,0.7]],
  [[0,69,2.0],[2.5,66,0.6],[3.4,64,0.5]],
  [[0,69,1.2],[1.5,74,0.7],[2.5,78,1.2]],
  [[0,76,0.8],[1,74,0.7],[2,71,1.6]],
  [[0,67,1.1],[1.5,71,0.8],[2.5,69,1.0]],
  [[0,66,0.7],[1,69,0.7],[2,73,1.7]],
  [[0,74,0.8],[1,76,0.7],[2,78,0.9],[3,76,0.7]],
  [[0,74,0.8],[1,71,0.7],[2,69,1.6]],
  [[0,67,0.8],[1,66,0.7],[2,64,0.8],[3,66,0.7]],
  [[0,62,2.8]],
];
const dayMelody = [
  [[0,64,0.8],[1,67,0.7],[2,72,1.3]], [[0,71,0.7],[1,67,0.7],[2,69,1.5]],
  [[0,72,0.8],[1,74,0.7],[2,76,1.3]], [[0,74,0.7],[1,72,0.7],[2,69,1.6]],
  [[0,67,0.7],[1,69,0.7],[2,72,1.4]], [[0,74,0.8],[1,71,0.7],[2,67,1.4]],
  [[0,69,0.8],[1,72,0.7],[2,76,1.4]], [[0,74,0.6],[1,72,0.7],[2,67,1.6]],
  [[0,76,0.8],[1,74,0.6],[2,72,1.5]], [[0,71,0.7],[1,69,0.7],[2,67,1.5]],
  [[0,69,0.6],[1,72,0.8],[2,76,1.4]], [[0,77,0.8],[1,76,0.7],[2,72,1.4]],
  [[0,74,0.7],[1,72,0.7],[2,69,1.5]], [[0,67,0.8],[1,71,0.7],[2,74,1.4]],
  [[0,76,0.7],[1,72,0.7],[2,69,1.4]], [[0,67,0.8],[1,64,0.6],[2,60,1.5]],
  [[0,64,0.7],[1,67,0.6],[2,72,1.4]], [[0,71,0.7],[1,74,0.7],[2,79,1.4]],
  [[0,76,0.8],[1,72,0.7],[2,69,1.4]], [[0,77,0.7],[1,76,0.7],[2,72,1.5]],
  [[0,74,0.7],[1,76,0.7],[2,77,1.3]], [[0,76,0.7],[1,74,0.7],[2,71,1.5]],
  [[0,72,0.8],[1,69,0.7],[2,67,1.4]], [[0,64,0.7],[1,67,0.7],[2,72,1.9]],
];
const nightMelody = [
  [[0,69,2],[2.5,64,1]], [[1,72,1.2],[3,71,0.8]], [[0,69,1.5],[2.5,65,1]], [[1,64,2]],
  [[0,60,1.2],[2,64,1.3]], [[0,67,1],[2,69,1.5]], [[0,71,1.4],[2.5,67,1]], [[0,64,2.5]],
  [[0,72,1.4],[2.5,69,1]], [[0,67,1.2],[2,64,1.4]], [[0,65,1.2],[2,69,1.5]], [[0,71,1],[2,68,1.5]],
  [[0,69,1.3],[2.5,72,1]], [[0,71,1],[2,67,1.5]], [[0,65,1],[2,64,1.5]], [[0,69,2.6]],
];
const siegeMelody = [
  [[0,69,0.6],[0.75,72,0.5],[1.5,76,1],[3,74,0.7]], [[0,72,0.7],[1,69,0.7],[2,67,1.5]],
  [[0,65,0.6],[0.75,69,0.6],[1.5,72,1],[3,69,0.7]], [[0,71,0.8],[1,74,0.7],[2,67,1.4]],
  [[0,69,0.6],[0.75,72,0.5],[1.5,76,1],[3,79,0.7]], [[0,76,0.7],[1,74,0.7],[2,72,1.5]],
  [[0,71,0.7],[1,69,0.7],[2,67,0.7],[3,64,0.7]], [[0,68,0.8],[1,71,0.7],[2,69,1.4]],
  [[0,72,0.6],[0.75,76,0.6],[1.5,79,1],[3,76,0.7]], [[0,74,0.7],[1,71,0.7],[2,67,1.4]],
  [[0,69,0.6],[0.75,72,0.6],[1.5,76,1],[3,72,0.7]], [[0,69,0.8],[1,65,0.7],[2,64,1.5]],
  [[0,65,0.6],[0.75,69,0.6],[1.5,72,1],[3,74,0.7]], [[0,76,0.7],[1,74,0.7],[2,71,1.4]],
  [[0,69,0.7],[1,72,0.6],[2,71,0.6],[3,68,0.7]], [[0,69,2.5]],
];
const D = [50,54,57], Bm = [47,50,54], G = [43,47,50], A = [45,49,52], Em = [40,43,47];
const C = [48,52,55], Gm = [43,47,50], Am = [45,48,52], F = [41,45,48], E = [40,44,47];
const scores = [
  { file:"lobby", bpm:80, chords:[D,Bm,G,A,D,Bm,G,A,Em,Bm,G,A,G,D,Em,A,D,Bm,G,A,D,Bm,G,D], melody:lobbyMelody, mode:"lobby" },
  { file:"day", bpm:92, chords:[C,Gm,Am,F,C,Gm,Am,F,C,Gm,Am,F,F,Gm,Am,C,C,Gm,Am,F,F,Gm,Am,C], melody:dayMelody, mode:"day" },
  { file:"night", bpm:60, chords:[Am,Am,F,E,C,Gm,Am,E,Am,Gm,F,E,Am,Gm,F,Am], melody:nightMelody, mode:"night" },
  { file:"siege", bpm:112, chords:[Am,Am,F,Gm,Am,Am,Gm,E,C,Gm,Am,F,F,Gm,E,Am], melody:siegeMelody, mode:"siege" },
];

function render(score) {
  const beat = 60 / score.bpm;
  const length = Math.round(score.chords.length * 4 * beat * rate);
  const left = new Float32Array(length), right = new Float32Array(length);
  const note = (instrument, midi, seconds, duration, volume, pan = 0) => {
    const bank = instruments[instrument];
    const { midi: rootNote, sample } = bank.reduce((a,b) => Math.abs(b.midi-midi) < Math.abs(a.midi-midi) ? b : a);
    const speed = Math.pow(2, (midi-rootNote)/12);
    const n = Math.min(Math.floor(duration * rate), Math.floor((sample.length-2) / speed));
    const start = Math.round(seconds * rate), l = Math.sqrt((1-pan)/2), r = Math.sqrt((1+pan)/2);
    for (let i=0; i<n; i++) {
      const pos=i*speed, k=pos|0, frac=pos-k;
      const env=Math.min(1, i/(rate*0.008)) * Math.min(1, (n-i)/(rate*0.18));
      const v=(sample[k]*(1-frac)+sample[k+1]*frac)*volume*env;
      const j=(start+i)%length; left[j]+=v*l; right[j]+=v*r;
    }
  };
  const pad = (midi, seconds, duration, volume) => {
    const n=Math.floor(duration*rate), start=Math.round(seconds*rate), hz=440*Math.pow(2,(midi-69)/12);
    for(let i=0;i<n;i++) {
      const t=i/rate, env=Math.min(1,t/0.8)*Math.min(1,(duration-t)/0.8);
      const v=(Math.sin(t*hz*Math.PI*2)+0.18*Math.sin(t*hz*Math.PI*4))*volume*env;
      const j=(start+i)%length; left[j]+=v*0.7; right[j]+=v*0.7;
    }
  };
  const drum = (seconds, volume, kind) => {
    const n=Math.floor(rate*(kind==="kick" ? 0.34 : 0.10)), start=Math.round(seconds*rate);
    let phase=0, seed=(start+1234567)|0;
    for(let i=0;i<n;i++) {
      const t=i/rate; seed=(1664525*seed+1013904223)|0;
      const noise=(seed/2147483648);
      const freq=kind==="kick"? 46+82*Math.exp(-t*30) : 650;
      phase+=freq/rate*2*Math.PI;
      const v=(kind==="kick" ? Math.sin(phase)+noise*0.10 : noise*0.4)*volume*Math.exp(-t*(kind==="kick"?13:35));
      const j=(start+i)%length; left[j]+=v*0.7; right[j]+=v*0.7;
    }
  };
  score.chords.forEach((chord, bar) => {
    const at=bar*4*beat, dynamics=0.92+0.08*Math.sin(bar*0.8);
    const isNight=score.mode==="night", isSiege=score.mode==="siege";
    // Violão dedilhado; andamento e dinâmica são próprios de cada cena.
    const arp=isNight ? [0,2,1,2] : [0,1,2,1,0,1,2,1];
    arp.forEach((which,i) => {
      const step=isNight ? 1 : 0.5;
      const pitch=chord[which]+(which ? 12 : 0);
      const vol=(isNight?0.17:isSiege?0.18:0.23)*dynamics*(i%2 ? 0.78 : 1);
      note("guitar", pitch, at+i*step*beat, beat*(isNight?1.6:1.15), vol, i%2 ? 0.22 : -0.25);
    });
    // Baixo e colchão discretos; não encobrem a melodia nem os efeitos.
    note("piano", chord[0]-12, at, beat*3.4, (isNight?0.12:0.16)*dynamics, -0.14);
    pad(chord[0], at, beat*4.1, isSiege?0.014:0.009);
    if(isSiege) { drum(at,0.14,"kick"); drum(at+beat*2,0.11,"kick"); drum(at+beat*1.5,0.06,"tap"); drum(at+beat*3.5,0.05,"tap"); }
    else if(score.mode==="day" && bar%2===0) drum(at,0.045,"kick");
    score.melody[bar].forEach(([offset,pitch,duration], i) => {
      const vol=(isNight?0.20:isSiege?0.29:0.27)*dynamics*(i===0?1:0.87);
      note("piano", pitch, at+offset*beat, duration*beat, vol, i%2 ? 0.16 : 0.04);
    });
  });
  // Duas reflexões estéreo suaves, circulares para que a cauda não seja cortada no loop.
  const dryL=left.slice(), dryR=right.slice();
  for(let i=0;i<length;i++) {
    const a=(i-Math.round(0.23*rate)+length)%length, b=(i-Math.round(0.39*rate)+length)%length;
    left[i]+=dryR[a]*0.10+dryL[b]*0.045;
    right[i]+=dryL[a]*0.10+dryR[b]*0.045;
  }
  let peak=0, power=0;
  for(let i=0;i<length;i++) { peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i])); power+=(left[i]*left[i]+right[i]*right[i])*0.5; }
  const rms=Math.sqrt(power/length);
  const scale=Math.min(0.84/Math.max(peak,0.001),0.09/Math.max(rms,0.001));
  const pcm=Buffer.allocUnsafe(length*8);
  for(let i=0;i<length;i++) { pcm.writeFloatLE(left[i]*scale,i*8); pcm.writeFloatLE(right[i]*scale,i*8+4); }
  const target=join(out,`${score.file}.mp3`);
  const encoded=spawnSync(ffmpeg,["-v","error","-y","-f","f32le","-ar",String(rate),"-ac","2","-i","pipe:0","-codec:a","libmp3lame","-b:a","96k",target],{input:pcm,maxBuffer:1024*1024});
  if(encoded.status!==0) throw new Error(`Erro codificando ${target}: ${encoded.stderr}`);
  console.log(`${target}: ${(length/rate).toFixed(1)} s; pico ${(peak*scale).toFixed(3)}; RMS ${(Math.sqrt(power/length)*scale).toFixed(3)}`);
}
for(const score of scores) render(score);
