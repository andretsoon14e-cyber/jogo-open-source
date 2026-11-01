#!/usr/bin/env node
/* Banco de efeitos/ambientes: usa as fontes CC0 descritas em public/audio/CREDITOS.md.
 * FFMPEG=/caminho/ffmpeg AUDIO_SOURCE_ROOT=/pasta/audio-sources KENNEY_ROOT=/pasta/game-sounds/sounds node scripts/build-sound-bank.mjs
 * O manifesto é gerado junto do sprite para manter posições e arquivo sincronizados.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ffmpeg=process.env.FFMPEG || "ffmpeg";
const root=process.env.AUDIO_SOURCE_ROOT || "/home/user/audio-sources";
const kenney=process.env.KENNEY_ROOT || "/home/user/game-sounds/sounds";
const output="public/audio";
const rate=32000;
mkdirSync(join(output,"ambient"),{recursive:true});
const k=(path)=>join(kenney,path), s=(path)=>join(root,path);
// [nome no jogo, arquivo de origem, início opcional, duração máxima opcional]
const files=[
  ["chop1",k("rpg/chop_01.mp3")], ["chop2",k("impacts/wood_medium_01.mp3")], ["chop3",k("impacts/wood_medium_03.mp3")],
  ["stone1",k("impacts/mining_01.mp3")], ["stone2",k("impacts/mining_02.mp3")], ["stone3",k("impacts/mining_04.mp3")],
  ["metal1",k("impacts/metal_medium_01.mp3")], ["metal2",k("impacts/metal_medium_03.mp3")],
  ["crystal1",k("impacts/glass_light_01.mp3")], ["crystal2",k("impacts/glass_light_04.mp3")],
  ["rustle1",s("animals/rustle0.ogg")], ["rustle2",s("animals/rustle1.ogg")],
  ["swing1",k("rpg/slice_01.mp3")], ["swing2",k("rpg/slice_02.mp3")],
  ["hit1",k("impacts/punch_medium_01.mp3")], ["hit2",k("impacts/punch_medium_02.mp3")], ["hit3",k("impacts/punch_medium_04.mp3")],
  ["hurt1",k("impacts/punch_heavy_01.mp3")], ["hurt2",k("impacts/punch_heavy_03.mp3")],
  ["cloth1",k("rpg/cloth_01.mp3")], ["cloth2",k("rpg/cloth_03.mp3")],
  ["coin1",k("rpg/coins_01.mp3")], ["coin2",k("rpg/coins_02.mp3")],
  ["gem1",k("ui/glass_01.mp3")], ["gem2",k("ui/glass_03.mp3")],
  ["build1",k("impacts/wood_heavy_01.mp3")], ["build2",k("impacts/wood_heavy_03.mp3")],
  ["break1",k("impacts/wood_heavy_04.mp3")], ["break2",k("impacts/wood_heavy_05.mp3")],
  ["chest1",k("rpg/creak_01.mp3")], ["chest2",k("rpg/creak_02.mp3")],
  ["equip1",k("rpg/draw_blade_01.mp3")], ["equip2",k("rpg/draw_blade_02.mp3")],
  ["ui1",k("ui/click_01.mp3")], ["ui2",k("ui/click_03.mp3")],
  ["quest1",k("ui/confirm_01.mp3")], ["quest2",k("ui/confirm_03.mp3")],
  ["eat1",k("rpg/cloth_05.mp3")], ["eat2",k("rpg/leather_01.mp3")],
  ["death",k("arcade/zap_three_down_01.mp3")],
  ["grass1",k("footsteps/footstep_grass_01.mp3")], ["grass2",k("footsteps/footstep_grass_03.mp3")], ["grass3",k("footsteps/footstep_grass_05.mp3")],
  ["dirt1",k("footsteps/footstep_dirt_01.mp3")], ["dirt2",k("footsteps/footstep_dirt_04.mp3")], ["dirt3",k("footsteps/footstep_dirt_07.mp3")],
  ["snow1",k("footsteps/footstep_snow_01.mp3")], ["snow2",k("footsteps/footstep_snow_03.mp3")],
  ["bridge1",k("footsteps/footstep_wood_01.mp3")], ["bridge2",k("footsteps/footstep_wood_03.mp3")],
  ["rock1",k("footsteps/footstep_concrete_01.mp3")], ["rock2",k("footsteps/footstep_concrete_03.mp3")],
  ["goat1",s("animals/goat_bah2.ogg")], ["goat2",s("animals/goat_exclaim.ogg")], ["goat3",s("animals/goat-single.wav")],
  ["goose1",s("animals/goose_say2.ogg")], ["goose2",s("animals/goose_say3.ogg")], ["goose3",s("animals/goose_ask.ogg")],
  ["bird1",s("ambient/bird_forest.ogg"),0.08,1.47], ["bird2",s("ambient/bird_forest.ogg"),1.63,1.45], ["bird3",s("ambient/bird_forest.ogg"),3.16,1.23],
  ["bones1",s("creatures/bones0.ogg")], ["bones2",s("creatures/bones3.ogg")], ["bones3",s("creatures/bones6.ogg")],
  ["slime1",k("scifi/slime_01.mp3")], ["slime2",k("scifi/slime_02.mp3")],
  ...["ogre-1","ogre-2","ogre-3","ogre-4","ogre-5","ogre-6","ogre-7","ogre-8","ogre-9","ogre-10","duck-monster8","duck-monster9","duck-monster10","duck-monster11","duck-monster12","duck-monster13","duck-monster14","duck-monster15","duck-monster16","duck-die1","duck-die2","duck-die3","duck-roar4"].map((name)=>[name,s(`creatures/${name}.mp3`)]),
];
function decode(path,start=0,duration=0) {
  const args=["-v","error","-i",path];
  if(start) args.push("-ss",String(start));
  if(duration) args.push("-t",String(duration));
  args.push("-ar",String(rate),"-ac","1","-f","f32le","pipe:1");
  const result=spawnSync(ffmpeg,args,{maxBuffer:20*1024*1024});
  if(result.status!==0) throw new Error(`Erro ao decodificar ${path}: ${result.stderr}`);
  const bytes=Uint8Array.from(result.stdout); return new Float32Array(bytes.buffer);
}
function encode(pcm,path,bitrate="56k") {
  const bytes=Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength);
  const result=spawnSync(ffmpeg,["-v","error","-y","-f","f32le","-ar",String(rate),"-ac","1","-i","pipe:0","-codec:a","libmp3lame","-b:a",bitrate,path],{input:bytes,maxBuffer:1024*1024});
  if(result.status!==0) throw new Error(`Erro ao codificar ${path}: ${result.stderr}`);
}
const chunks=[], manifest={}; let size=0;
const silence=Math.round(rate*0.12);
for(const [name,path,start=0,duration=0] of files) {
  const decoded=decode(path,start,duration);
  let first=0,last=decoded.length;
  while(first<last && Math.abs(decoded[first])<0.0015) first++;
  while(last>first && Math.abs(decoded[last-1])<0.0015) last--;
  first=Math.max(0,first-Math.round(rate*0.015)); last=Math.min(decoded.length,last+Math.round(rate*0.035));
  const length=last-first; if(length<=0) throw new Error(`Amostra vazia: ${path}`);
  let peak=0; for(let i=first;i<last;i++) peak=Math.max(peak,Math.abs(decoded[i]));
  const gain=Math.min(6,0.76/Math.max(peak,0.0001));
  const clip=new Float32Array(length+silence);
  for(let i=0;i<length;i++) {
    const fade=Math.min(1,i/(rate*0.008),(length-i)/(rate*0.035));
    clip[i]=decoded[first+i]*gain*fade;
  }
  manifest[name]=[Number((size/rate).toFixed(6)),Number((length/rate).toFixed(6))];
  chunks.push(clip); size+=clip.length;
}
const sprite=new Float32Array(size); let offset=0;
for(const clip of chunks) { sprite.set(clip,offset); offset+=clip.length; }
encode(sprite,join(output,"effects.mp3"));
writeFileSync("src/game/audio-cues.generated.json",JSON.stringify(manifest,null,2)+"\n");
console.log(`Efeitos: ${files.length} fatias, ${(size/rate).toFixed(1)} s.`);

// Recorte + crossfade entre cauda e início. Cada loop contém L - fade segundos.
for(const [name,path,start,duration] of [
  ["wind",s("ambient/wind.ogg"),8,28],
  ["sea",s("ambient/surf_far.ogg"),8,27],
  ["water",s("ambient/stream.ogg"),6,24],
  ["fire",s("ambient/bonfire.ogg"),3,23],
]) {
  const src=decode(path,start,duration), fade=Math.min(Math.round(rate*(name==="fire"?0.65:1.5)),Math.floor(src.length/4));
  const length=src.length-fade, pcm=new Float32Array(length);
  for(let i=0;i<length-fade;i++) pcm[i]=src[i+fade];
  for(let j=0;j<fade;j++) {
    const a=j/(fade-1), mix=0.5-0.5*Math.cos(Math.PI*a);
    pcm[length-fade+j]=src[src.length-fade+j]*(1-mix)+src[j]*mix;
  }
  encode(pcm,join(output,"ambient",`${name}.mp3`),"48k");
  console.log(`Ambiente ${name}: ${(length/rate).toFixed(1)} s.`);
}
