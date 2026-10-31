/* =========================================================
   Pixel-art sprite system (strings -> baked canvases).
   All sprites are authored at 1px and scaled by SCALE with a
   crisp dark outline, matching the reference art style.
   ========================================================= */

import { CHARACTER_WIDTH, CHARACTER_HEIGHT, CHARACTER_HEAD_HEIGHT, makeCharacterSprite } from "./character-art";
import { EXPANSION_SPRITES } from "./expansion-art";
import { craftOrcThumbnail, drawCraftHero, hasCraftHero, hasCraftOrcs } from "./craftpix";
import { drawReferenceIcon, referenceIconUrl } from "./reference-art";

export const SCALE = 3;

export interface PixelSprite {
  rows: string[];
  legend: Record<string, string>;
  ax?: number; // anchor x (sprite px). default: w/2
  ay?: number; // anchor y (sprite px). default: h (bottom)
  outline?: string | null;
}

const OUTLINE = "#1b1522";

/* ---------------- tiny grid builder for procedural sprites ---------------- */
function grid(w: number, h: number): string[][] {
  const g: string[][] = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill("."));
  return g;
}
function rect(g: string[][], x: number, y: number, w: number, h: number, ch: string) {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= g.length) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= g[0].length) continue;
      g[yy][xx] = ch;
    }
  }
}
function rowsOf(g: string[][]) { return g.map((r) => r.join("")); }

/* =========================================================
   CHARACTERS — layered templates (16 x 23)
   ========================================================= */
export type View = "down" | "up" | "side";
export type Hair = "topknot" | "hat" | "short" | "hood";

export interface CharLook {
  skin: string; skinD: string;
  hair: string; hairD: string;
  shirt: string; shirtD: string;
  pants: string; pantsD: string;
  boots: string; belt: string;
  hat: string; hatD: string;
  eye: string; style: Hair;
}

const NAVY = "#2d3d66", NAVY_D = "#1b2746";
export const CHAR_LOOKS: Record<string, CharLook> = {
  player: { skin: "#d69a66", skinD: "#b67a4c", hair: NAVY, hairD: NAVY_D, shirt: "#dcd8d0", shirtD: "#aaa49c", pants: "#a63349", pantsD: "#7c2437", boots: "#4a3222", belt: "#6b4a2a", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#4a5670", style: "topknot" },
  rian: { skin: "#cf905e", skinD: "#aa7046", hair: NAVY, hairD: NAVY_D, shirt: "#3d8a4a", shirtD: "#2a6234", pants: "#bfae8e", pantsD: "#968666", boots: "#4a3222", belt: "#5a3a22", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#4a5670", style: "hat" },
  maya: { skin: "#c98a5a", skinD: "#a66f44", hair: NAVY, hairD: NAVY_D, shirt: "#2f8f84", shirtD: "#1f655d", pants: "#3a3228", pantsD: "#27211a", boots: "#221910", belt: "#7a5a2a", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#3b4f5c", style: "topknot" },
  tito: { skin: "#e6b78e", skinD: "#c4946a", hair: "#6a4524", hairD: "#4a2e16", shirt: "#e0c15a", shirtD: "#b0953c", pants: "#5a5148", pantsD: "#3e3832", boots: "#3a3024", belt: "#8a6428", hat: "#c9b45a", hatD: "#9a8838", eye: "#4a5670", style: "hat" },
  bren: { skin: "#c88860", skinD: "#a06a46", hair: "#4a1e14", hairD: "#2e120c", shirt: "#8d3030", shirtD: "#5e1e1e", pants: "#2c2c2c", pantsD: "#1a1a1a", boots: "#161616", belt: "#6a5038", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#3a3a44", style: "short" },
  remote: { skin: "#e2b48a", skinD: "#c08e66", hair: "#243044", hairD: "#141c2c", shirt: "#4c86c9", shirtD: "#355f90", pants: "#343a44", pantsD: "#22262c", boots: "#22262c", belt: "#6b4a2a", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#2c3a50", style: "short" },
  v0: { skin: "#c9956a", skinD: "#a6764e", hair: "#4a3020", hairD: "#2e1c12", shirt: "#c45a4a", shirtD: "#8e3c30", pants: "#5a4030", pantsD: "#3e2c20", boots: "#3a281c", belt: "#f0d2a8", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#3a3a44", style: "short" },
  v1: { skin: "#e8c4a0", skinD: "#c49e7a", hair: NAVY, hairD: NAVY_D, shirt: "#6a8cae", shirtD: "#486482", pants: "#3e4a55", pantsD: "#2a333a", boots: "#2a3038", belt: "#e8e0d0", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#3a3a44", style: "topknot" },
  v2: { skin: "#d7a574", skinD: "#b28256", hair: "#5a3a18", hairD: "#3a240e", shirt: "#7ea04a", shirtD: "#587432", pants: "#4a4030", pantsD: "#322a1e", boots: "#322818", belt: "#efe6c8", hat: "#7a6a4a", hatD: "#56482e", eye: "#3a3a44", style: "hat" },
  v3: { skin: "#efc8ae", skinD: "#c8a088", hair: "#6a3058", hairD: "#46203a", shirt: "#c46a92", shirtD: "#8e4a68", pants: "#4a3848", pantsD: "#322632", boots: "#322028", belt: "#f3d0e0", hat: "#8a5a32", hatD: "#5e3a1c", eye: "#3a3a44", style: "topknot" },
  v4: { skin: "#b8875c", skinD: "#946a46", hair: "#d8d0c8", hairD: "#a8a098", shirt: "#7a5a9a", shirtD: "#563e6e", pants: "#3a3844", pantsD: "#26242c", boots: "#222028", belt: "#e6dcc8", hat: "#3a3844", hatD: "#26242c", eye: "#3a3a44", style: "hood" },
};

/* =========================================================
   WORLD SPRITES
   ========================================================= */
const S: Record<string, PixelSprite> = {};

S.goblin = {
  legend: { g: "#7aa33f", G: "#4f7128", e: "#ff4040", k: "#2b1b12", c: "#8b5a36", w: "#f0eadc", s: "#a87448", m: "#c8ced6", d: "#5a3a22" },
  rows: [
    "m...............",
    "s..G.........G..",
    "s.GGg.......gGG.",
    "s.GgggggggggggG.",
    "s..GgggggggggG..",
    "s...ggeggggegg..",
    "s...gggggggggg..",
    "s....gGwwwwGg...",
    "s.....gggggg....",
    "s....gcccccccg..",
    "s....gcccccccg..",
    "s.....ccccccc...",
    "s.....GG...GG...",
    "d.....GG...GG...",
    "......kk...kk...",
  ],
};
S.ghost = {
  legend: { b: "#bfe2f6", B: "#8fc3e3", e: "#ff3b3b", k: "#1a2a3a" },
  outline: "#3d5f7a",
  rows: [
    "......bbbb......",
    "....bbbbbbbb....",
    "...bbbbbbbbbb...",
    "..bbbbbbbbbbbb..",
    "..bbbeebbbeebb..",
    "..bbbeebbbeebb..",
    "..bbbbbbbbbbbb..",
    ".bbbbbbbbkbbbbb.",
    ".bbbbbbbbbbbbbb.",
    "bbb.bbbbbbbb.bbb",
    "BB..bbbbbbbb..BB",
    "....BbbbbbbbB...",
    "....BbbbbbbbB...",
    ".....BbBbbBbB...",
    "......B.BB.B....",
  ],
};
S.wraith = {
  legend: { r: "#3a4f7a", R: "#273858", k: "#141a2a", e: "#ff9a2a", E: "#ffd36a" },
  rows: [
    "......rrrr......",
    ".....rrrrrr.....",
    "....rrrrrrrr....",
    "....rrkkkkrr....",
    "...rrkkkkkkrr...",
    "...rrkEkkkkEkrr.",
    "...rrkeekkeekrr.",
    "...rrkkkkkkkkrr.",
    "...rrrkkkkkkrrr.",
    "..rrrrrrrrrrrrr.",
    "..rrrrrrrrrrrrr.",
    ".rrRrrrrrrrrRrr.",
    ".rrRrrrrrrrrRrr.",
    "..RRrrrrrrrrRR..",
    "...RrRrrrrRrR...",
    "....R.RrrR.R....",
    "......R..R......",
  ],
};
S.skelmage = {
  legend: { w: "#ece6d6", W: "#c9c0a8", k: "#1b1b22", g: "#5ad96a", s: "#9a7046", c: "#6a4a3a", C: "#4a3328" },
  rows: [
    "..............g.",
    ".............ggg",
    "......wwww....g.",
    ".....wwwwww...s.",
    "....wwwwwwww..s.",
    "....wkkwwkkw..s.",
    "....wkgwwgkw..s.",
    "....wwwwwwww..s.",
    ".....wWWWWw...s.",
    ".....wkwkwk...s.",
    "......wwww....s.",
    ".....cccccc...s.",
    "....wcccccccw.s.",
    "....wcccccccws..",
    ".....cCccCcc..s.",
    ".....cccccccc.s.",
    ".....cccccccc.s.",
    "....CcccccccC.s.",
    "....ww.....ww.s.",
  ],
};
S.treant = {
  legend: { t: "#6b4a2e", T: "#4a3120", l: "#5f9a3a", e: "#ff6a3a", k: "#1a1008", m: "#8a6540" },
  rows: [
    "...l.....tt....l....",
    "..lT....tTt...Tl....",
    "...T...tttttt.T.....",
    "...T..ttttttttT.....",
    "....T.ttttttttt.....",
    "....TtteettteettT...",
    "....TtteettteettT...",
    ".....ttttttttttt....",
    ".....tttkkkkktt.....",
    ".....ttkkkkkkktt....",
    "...TttttttttttttT...",
    "..TTtttttttttttttTT.",
    ".TT.ttttttttttttt.TT",
    "TT..tttmmmtttttt..TT",
    "T...tttttttttttt...T",
    "....tttttttttttt....",
    "....ttttTTtttttt....",
    ".....tttt..tttt.....",
    ".....tttt..tttt.....",
    ".....TTTT..TTTT.....",
    "....TTTTT..TTTTT....",
    "...TT.TTT..TTT.TT...",
  ],
};
S.golem = {
  legend: { r: "#a07c58", R: "#7a5a3c", d: "#54402a", e: "#ffe27a", k: "#2a1c10", h: "#c49a6e" },
  rows: [
    ".......rrrrrr.......",
    "......rrrrrrrr......",
    "......reerrreer.....",
    "......rrrrrrrr......",
    ".......rkkkkr.......",
    "...rrrrrrrrrrrrrr...",
    "..rrrrrrrrrrrrrrrr..",
    ".rrrRrrrhhhrrrRrrrr.",
    ".rrrRrrrrrrrrrRrrrr.",
    "rrrR.rrrrrrrrrr.Rrrr",
    "rrR..rrrrrrrrrr..Rrr",
    "rrR..rrrRRrrrrr..Rrr",
    "RRR..rrrrrrrrrr..RRR",
    ".....rrrrrrrrrr.....",
    ".....RrrrrrrrrR.....",
    ".....rrrr..rrrr.....",
    ".....rrrr..rrrr.....",
    ".....RRRR..RRRR.....",
    "....RRRRR..RRRRR....",
    "....ddddd..ddddd....",
  ],
};
S.crystalgolem = {
  legend: { w: "#e8ecf0", W: "#b8c0cc", g: "#8a94a4", p: "#b24ff0", P: "#7a2fb8", e: "#3b2a6a", k: "#1a1424" },
  rows: [
    "........p......p........",
    ".......pp......pp.......",
    "......ppp.wwww.ppp......",
    ".....pPpwwwwwwwwpPp.....",
    ".....PPpwwwwwwwwpPP.....",
    "....pPPwwwwwwwwwwPPp....",
    "....PPwwwweewweewwwPP...",
    "...pPPwwwweewweewwwPPp..",
    "...PPwwwwwwwwwwwwwwwPP..",
    "..pPPwwwwwkkkkwwwwwwPPp.",
    "..PPwwwwwwwwwwwwwwwwwPP.",
    ".pPwwwwwwwwwwwwwwwwwwwPp",
    ".PwwwwWwwwwwwwwwwWwwwwwP",
    "PwwwW..wwwwwwwwww..WwwwP",
    "wwwwW..wwwwwwwwww..Wwwww",
    "wwwwW..wwwwWWwwww..Wwwww",
    "WWWWW..wwwwwwwwww..WWWWW",
    "gggg...wwwwwwwwww...gggg",
    ".......WwwwwwwwwW.......",
    ".......wwwww..wwwww.....",
    ".......wwwww..wwwww.....",
    ".......WWWWW..WWWWW.....",
    "......WWWWWW..WWWWWW....",
    "......gggggg..gggggg....",
  ],
};

/* animals */
S.rabbit = {
  legend: { t: "#d9b48a", T: "#b8906a", w: "#fff8f0", e: "#2a1a12" },
  rows: [
    "..tt........",
    "..tt........",
    "..tt.tttt...",
    ".ttttttttt..",
    ".tetttttttt.",
    ".ttttttttttw",
    "..TttttttTT.",
    "..TT....TT..",
  ],
};
S.goose = {
  legend: { w: "#f4f4f0", W: "#cfd2cc", o: "#f0a030", e: "#1a1a1a" },
  rows: [
    "...ww.......",
    "..wwww......",
    "..wewwo.....",
    "..wwww.o....",
    "...ww.......",
    "...ww.......",
    "..wwwwwwww..",
    ".wwwwwwwwww.",
    ".wwwwwwwwwW.",
    "..WwwwwwwWW.",
    "...WWWWWW...",
    "....o..o....",
    "...oo..oo...",
  ],
};
S.goat = {
  legend: { b: "#8a6a4a", B: "#6a4e34", w: "#e8e0d0", h: "#3a2a1a", e: "#1a1a1a" },
  rows: [
    ".hh.............",
    "..hbb...........",
    ".bbbbb..........",
    ".bebbb..........",
    ".bbbbbbbbbbbbb..",
    "..bbbbbbwwbbbbb.",
    "..bbbbbbwwwbbbbb",
    "...bbbbbbbbbbbb.",
    "...BB.BB..BB.BB.",
    "...BB.BB..BB.BB.",
    "...hh.hh..hh.hh.",
  ],
};

/* items (10x10) */
S.it_wood = { legend: { b: "#9a6a3a", B: "#6e4a26", l: "#c99a62", r: "#e0b880" }, rows: ["..........", ".BBBBBBBr.", "Bbbbbbbblr", "Bbbllbbblr", "Bbbllbbblr", "BbbbbbbblB", ".BBBBBBBB.", ".........."] };
S.it_stone = { legend: { r: "#a8a8a4", R: "#767672", h: "#d0d0cc" }, rows: ["...hhr....", "..hrrrrr..", ".hrrrrrrr.", ".rrrrRrrr.", "rrrrRRrrrr", "RrrRRRRrrR", ".RRRRRRRR.", ".........."] };
S.it_fiber = { legend: { f: "#c9d55a", F: "#8ea33a", r: "#a87448" }, rows: ["f..f..f...", ".f.f.f....", "..fff.....", "..rrr.....", "..fff.....", ".f.f.f....", "f..f..f...", ".........."] };
S.it_food = { legend: { r: "#e04560", R: "#a82640", l: "#5fa33a", h: "#ff9aa8" }, rows: ["....l.....", "...ll.....", "..rrr.rr..", ".rhrrrrrr.", ".rrrrRrrr.", "..rrRRrr..", "...RRR....", ".........."] };
S.it_iron = { legend: { i: "#9aa6b4", I: "#66727f", h: "#d8e0e8" }, rows: ["..........", "..hhhhhh..", ".hiiiiiih.", ".iiiiiiiI.", ".iiIiiIiI.", ".IIIIIIII.", "..........", ".........."] };
S.it_crystal = { legend: { c: "#7de0e8", C: "#3fa8b8", w: "#dffbfd", p: "#b070f0" }, rows: ["....w.....", "...cwc....", "..ccwcc...", ".cccccCp..", ".ccccCCp..", "..ccCC....", "...CC.....", "...C......"] };

/* tools (16x6/8) handle left, head right */
const TOOL_PALETTE = {
  h: "#996038", H: "#5c3823", o: "#d4a36b", r: "#70482d",
  m: "#b3bec9", M: "#667789", e: "#f1f6fc", g: "#cba453", G: "#fff0b6",
};
function makeTool(kind: "axe" | "pick" | "sword"): PixelSprite {
  const g = grid(24, 12);
  if (kind === "sword") {
    rect(g, 1, 5, 8, 3, "H"); rect(g, 2, 5, 7, 1, "h");
    for (let x = 3; x < 8; x += 2) rect(g, x, 5, 1, 2, "r");
    rect(g, 0, 5, 2, 3, "g"); rect(g, 1, 6, 1, 1, "G");
    rect(g, 9, 3, 2, 6, "g"); rect(g, 8, 4, 4, 1, "G");
    rect(g, 8, 8, 4, 1, "g");
    rect(g, 11, 4, 9, 4, "M"); rect(g, 11, 4, 10, 2, "m");
    rect(g, 13, 4, 9, 1, "e"); rect(g, 19, 5, 3, 2, "m");
    rect(g, 22, 5, 1, 2, "e"); rect(g, 23, 6, 1, 1, "e");
  } else {
    rect(g, 1, 5, 18, 3, "H"); rect(g, 2, 5, 17, 1, "o");
    rect(g, 3, 7, 4, 1, "r"); rect(g, 10, 7, 3, 1, "r");
    rect(g, 1, 6, 2, 1, "g"); rect(g, 16, 5, 2, 3, "g");
    if (kind === "axe") {
      rect(g, 18, 1, 3, 11, "M"); rect(g, 19, 2, 3, 9, "m");
      rect(g, 20, 1, 2, 1, "e"); rect(g, 21, 3, 2, 2, "e");
      rect(g, 22, 5, 2, 3, "e"); rect(g, 21, 9, 2, 2, "e");
      rect(g, 19, 11, 2, 1, "e");
    } else {
      rect(g, 18, 4, 3, 5, "M"); rect(g, 16, 2, 6, 2, "m");
      rect(g, 13, 2, 4, 1, "e"); rect(g, 21, 3, 2, 1, "e");
      rect(g, 19, 9, 2, 2, "m"); rect(g, 20, 11, 1, 1, "e");
    }
  }
  return { rows: rowsOf(g), legend: TOOL_PALETTE, ay: 6 };
}
S.tool_axe = makeTool("axe");
S.tool_pick = makeTool("pick");
S.tool_sword = makeTool("sword");
// Compact fallback if the optional bow reference has not been imported.
S.tool_bow = {
  legend: { w: "#704725", h: "#bc8952", s: "#e7d5a5" },
  rows: [".ww.............", ".whw............", ".s.hww..........", "..s..hww........", "...s...hw.......", "....s...hw......", ".....s...hw.....", "......s...hw....", ".......s...hw...", "........s...hw..", ".........s..hw..", "..........s.hw..", "...........shw..", "............sw..", "............ww..", "................"],
};

/* nodes */
S.tree = {
  legend: { l: "#4f9a3a", L: "#2f6e2a", m: "#7cc24e", t: "#6e4a26", T: "#4e3218" },
  rows: [
    "........llllllll........",
    "......llllmmllllll......",
    "....llllmmmmlllllll.....",
    "...lllllmmmllllllllll...",
    "..llllllmmlllllllLlll...",
    "..llllllllllllllLLllll..",
    ".lllllmllllllllllLLllll.",
    ".llllmmlllllllllllLllll.",
    ".lllllllllllLllllllllll.",
    ".llllllllllLLLlllllllll.",
    ".LlllllllllLLLLllllllll.",
    ".LLllllllllllLLLlllllLl.",
    "..LLllllllllllllllllLL..",
    "..LLLlllllllllllllLLL...",
    "...LLLLlllllllllLLLL....",
    "....LLLLLlllllLLLLL.....",
    "......LLLLtttLLLL.......",
    "........LLtttLL.........",
    "..........ttt...........",
    "..........tTt...........",
    "..........tTt...........",
    "..........tTt...........",
    ".........ttTtt..........",
    "........tttTttt.........",
    ".......TTTTTTTTT........",
  ],
};
S.pine = {
  legend: { l: "#3f8a3a", L: "#245a2a", m: "#5fae4e", t: "#5e3a1c", T: "#3e2410" },
  rows: [
    ".........ll.........",
    "........llll........",
    ".......llmlll.......",
    "......llmllll.......",
    ".....lllllllll......",
    "........llll........",
    ".......llmlll.......",
    "......llmlllll......",
    ".....lllllllllL.....",
    "....llllllllllLL....",
    "...llllllllllLLLL...",
    "........llllL.......",
    ".......llmlllL......",
    "......llmllllLL.....",
    ".....lllllllllLLL...",
    "....llllllllllLLLL..",
    "...lllllllllllLLLLL.",
    "..llllllllllllLLLLLL",
    "........lllLL.......",
    ".......llmllLL......",
    "......lllllllLLL....",
    ".....llllllllLLLL...",
    "....lllllllllLLLLL..",
    "...llllllllllLLLLLL.",
    "..lllllllllllLLLLLLL",
    ".........tt.........",
    ".........tT.........",
    ".........tT.........",
    "........tttT........",
    ".......TTTTTT.......",
  ],
};
S.tree_dark = { ...S.tree, legend: { l: "#2e5a30", L: "#1b3a20", m: "#447a3c", t: "#4a3220", T: "#2e1e12" } };
S.pine_dark = { ...S.pine, legend: { l: "#27532c", L: "#16331c", m: "#3a7040", t: "#3e2a18", T: "#26180c" } };
S.rock = {
  legend: { r: "#9a9a96", R: "#6e6e6a", h: "#c4c4c0", k: "#44443f" },
  rows: ["......hhhr......", "....hhrrrrrr....", "...hrrrrrrrrr...", "..hrrrrrrrrrrr..", "..rrrrrrrrRrrrr.", ".rrrrrrrrRRrrrr.", ".rrrrrrRRRRrrrr.", ".RrrrrRRRRRRrrR.", ".RRRRRRRRRRRRRR.", "..kkkkkkkkkkkk.."],
};
S.ore = {
  legend: { r: "#8a7a66", R: "#5e5044", h: "#b0a08a", k: "#3a3028", g: "#e0a848", G: "#f4d070" },
  rows: ["......hhhr......", "....hhrrrgrr....", "...hrrgGrrrrr...", "..hrrrrrrrrgGr..", "..rrgGrrrrRrrrr.", ".rrrrrrrrRRrgrr.", ".rrrgrrRRRRrrrr.", ".RrrrrRRRgGRrrR.", ".RRRRRRRRRRRRRR.", "..kkkkkkkkkkkk.."],
};
S.crystal = {
  legend: { c: "#7de0e8", C: "#3fa8b8", w: "#dffbfd", p: "#b070f0", P: "#7a3fb8", r: "#6e6e6a", R: "#4a4a46" },
  rows: ["......w.........", ".....cwc........", ".....ccc...p....", "....cccC..ppp...", "....ccCC..pPp...", "...wcccC.pppPp..", "...ccccC.pppPp..", "..cccccCCppPPp..", "..rrrcccCrrrrrr.", ".rrrrrrrrrrrrrrr", ".RRrrrrrrrrrrRR.", "..RRRRRRRRRRRR.."],
};
S.bush = {
  legend: { l: "#4f8a30", L: "#36652a", m: "#79b84c", y: "#e8e070" },
  rows: ["......llll......", "...lllllmlll....", "..lllmllllllll..", ".llllllllllmlll.", ".lllyllllllllll.", ".lllllllllyllll.", "..LlllllllllllL.", "..LLLlllllllLL..", "....LLLLLLLL...."],
};
S.berry = {
  legend: { l: "#4f8a30", L: "#36652a", m: "#79b84c", y: "#e0405a" },
  rows: ["......llll......", "...lllllmlll....", "..lllmlyllllll..", ".lllyllllllmlyl.", ".llllllyllllyll.", ".llyllllllyllll.", "..LlllyllllllyL.", "..LLLlllllllLL..", "....LLLLLLLL...."],
};

/* structures */
// Original fallback designed for this game: a ring of stones, crossed logs,
// and two flame frames. Unlike the old floating flame it has a grounded base.
S.campfire0 = {
  legend: { f: "#ffad35", F: "#db4b20", y: "#fff1a0", w: "#aa7041", W: "#603a25", t: "#d9ad75", s: "#55514d", S: "#9c9b8f" },
  rows: [
    "..........y..........", "..........f..........", ".......f.fy..........", ".......Fffy..f.......",
    ".......FffF.ff.......", "......FFfyFfFf.......", "......FffyfFFf.......", ".....FFfyyyfFFf......",
    ".....FfyyyyyfFf......", "......FFyyyFFf.......", ".....wwFFFFFww.......", "...sswwwWWWwwwss.....",
    "..sSSSwwwwwWwSSSs....", ".sSSSWWwwwwWWWSSSs...", ".sSSttWWwwWWttSSSs...", "..sSSttwwtttSSSSs....",
    "...ssSSSSSSSSss......", ".....ssssssss........",
  ],
};
S.campfire1 = {
  legend: S.campfire0.legend,
  rows: [
    "........y............", "........f............", "........yf..f........", "......f.yff.F........",
    "......ffFff.Ff.......", "......fFfyFfFF.......", ".....fFFfyffFf.......", ".....fFFfyyfFFf......",
    "......FfyyyyyFf......", "......FFyyyFFf.......", ".....wwFFFFFww.......", "...sswwwWWWwwwss.....",
    "..sSSSwwwwwWwSSSs....", ".sSSSWWwwwwWWWSSSs...", ".sSSttWWwwWWttSSSs...", "..sSSttwwtttSSSSs....",
    "...ssSSSSSSSSss......", ".....ssssssss........",
  ],
};
S.wall = {
  legend: { w: "#a8783f", W: "#7a532a", d: "#54371a", r: "#c9a26a", k: "#3a2612" },
  rows: [".w...w...w.", "www.www.www", "wWw.wWw.wWw", "wWw.wWw.wWw", "rrrrrrrrrrr", "wWw.wWw.wWw", "wWw.wWw.wWw", "wWw.wWw.wWw", "wWw.wWw.wWw", "wWw.wWw.wWw", "rrrrrrrrrrr", "wWw.wWw.wWw", "wWw.wWw.wWw", "wWw.wWw.wWw", "wWw.wWw.wWw", "dWd.dWd.dWd", "kkk.kkk.kkk"],
};
S.gate = {
  legend: { w: "#a8783f", W: "#7a532a", d: "#54371a", r: "#c9a26a", k: "#3a2612", y: "#e2c27a" },
  rows: ["k.........k", "kwwwwwwwwwk", "kwWWWWWWWwk", "kwwwwwwwwwk", "krrrrrrrrrk", "kwwwwwwwwwk", "kwWWWWWWWwk", "kwwwwwwwwwk", "kwwwwwwwwwk", "kwwwwywwwwk", "krrrrrrrrrk", "kwwwwwwwwwk", "kwWWWWWWWwk", "kwwwwwwwwwk", "kwwwwwwwwwk", "kdddddddddk", "kkkkkkkkkkk"],
};
S.gate_open = {
  legend: S.gate.legend,
  rows: ["k.........k", "kw.......wk", "kW.......Wk", "kw.......wk", "kr.......rk", "kw.......wk", "kW.......Wk", "kw.......wk", "kw.......wk", "kw.......wk", "kr.......rk", "kw.......wk", "kW.......Wk", "kw.......wk", "kw.......wk", "kd.......dk", "kk.......kk"],
};
S.chest = {
  legend: { w: "#a8783f", W: "#7a532a", y: "#e2c27a", Y: "#a8862a", k: "#3a2612" },
  rows: ["..wwwwwwwwwwww..", ".wWWWWWWWWWWWWw.", ".wwwwwwwwwwwwww.", ".yyyyyyyyyyyyyy.", ".wwwwwwyywwwwww.", ".wwwwwwyYwwwwww.", ".wWWWWWWWWWWWWw.", ".wwwwwwwwwwwwww.", ".kkkkkkkkkkkkkk."],
};
S.chest_open = {
  legend: { ...S.chest.legend, i: "#2a1c10" },
  rows: [".wwwwwwwwwwwwww.", ".wWWWWWWWWWWWWw.", ".wiiiiiiiiiiiiw.", ".yyyyyyyyyyyyyy.", ".wwwwwwwwwwwwww.", ".wwwwwwyYwwwwww.", ".wWWWWWWWWWWWWw.", ".wwwwwwwwwwwwww.", ".kkkkkkkkkkkkkk."],
};

/* procedural structures */
function houseSprite(): PixelSprite {
  const g = grid(32, 30);
  rect(g, 24, 3, 4, 7, "c"); rect(g, 23, 2, 6, 1, "C");
  for (let r = 0; r < 12; r++) rect(g, 15 - r, 4 + r, 2 + r * 2, 1, r % 3 === 2 ? "R" : "r");
  rect(g, 1, 16, 30, 2, "R");
  rect(g, 3, 18, 26, 10, "w");
  for (let k = 0; k < 5; k++) rect(g, 3, 19 + k * 2, 26, 1, "W");
  rect(g, 13, 20, 6, 8, "d"); rect(g, 17, 24, 1, 1, "y");
  rect(g, 22, 20, 5, 4, "y"); rect(g, 24, 20, 1, 4, "k"); rect(g, 22, 22, 5, 1, "k");
  rect(g, 5, 20, 5, 4, "y"); rect(g, 7, 20, 1, 4, "k"); rect(g, 5, 22, 5, 1, "k");
  rect(g, 2, 28, 28, 2, "k");
  return { rows: rowsOf(g), legend: { c: "#6e6e6a", C: "#8a8a86", r: "#8a4a3a", R: "#5e2e24", w: "#b4885a", W: "#8a6440", d: "#5a3a22", y: "#ffe28a", k: "#3a2612" } };
}
function farmSprite(): PixelSprite {
  const g = grid(32, 18);
  rect(g, 0, 3, 32, 14, "s");
  for (let k = 0; k < 4; k++) rect(g, 1, 5 + k * 3, 30, 1, "S");
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) { const x = 3 + i * 5; const y = 4 + k * 3; rect(g, x, y, 1, 2, "l"); rect(g, x - 1, y, 1, 1, "l"); rect(g, x + 1, y, 1, 1, "l"); }
  rect(g, 0, 2, 1, 15, "f"); rect(g, 31, 2, 1, 15, "f"); rect(g, 0, 17, 32, 1, "f");
  return { rows: rowsOf(g), legend: { s: "#7a5634", S: "#5a3e24", l: "#7fd04e", f: "#a8783f" } };
}
function sawmillSprite(): PixelSprite {
  const g = grid(28, 22);
  for (let r = 0; r < 6; r++) rect(g, 8 - r, 4 + r, 12 + r * 2, 1, "R");
  rect(g, 2, 10, 24, 10, "w");
  for (let k = 0; k < 5; k++) rect(g, 2, 11 + k * 2, 24, 1, "W");
  rect(g, 19, 6, 7, 7, "m"); rect(g, 21, 8, 3, 3, "M");
  rect(g, 18, 9, 1, 1, "m"); rect(g, 26, 9, 1, 1, "m"); rect(g, 22, 5, 1, 1, "m"); rect(g, 22, 13, 1, 1, "m");
  rect(g, 3, 14, 10, 3, "L"); rect(g, 4, 12, 8, 2, "l");
  rect(g, 1, 20, 26, 2, "k");
  return { rows: rowsOf(g), legend: { R: "#5e2e24", w: "#b4885a", W: "#8a6440", m: "#c8ccd4", M: "#7a8088", l: "#a8783f", L: "#7a532a", k: "#3a2612" } };
}
function quarrySprite(): PixelSprite {
  const g = grid(28, 18);
  rect(g, 2, 10, 24, 6, "r"); rect(g, 5, 7, 18, 3, "r"); rect(g, 9, 4, 10, 3, "h");
  rect(g, 3, 13, 22, 1, "R"); rect(g, 7, 9, 14, 1, "R");
  rect(g, 22, 2, 2, 14, "w"); rect(g, 14, 2, 10, 1, "w"); rect(g, 14, 3, 1, 3, "k");
  rect(g, 1, 16, 26, 2, "k");
  return { rows: rowsOf(g), legend: { r: "#9a9a96", R: "#6e6e6a", h: "#c4c4c0", w: "#a8783f", k: "#3a2612" } };
}
function forgeSprite(): PixelSprite {
  const g = grid(24, 22);
  rect(g, 15, 1, 4, 6, "s"); rect(g, 4, 7, 16, 12, "s"); rect(g, 6, 7, 12, 1, "S");
  rect(g, 8, 11, 8, 6, "k"); rect(g, 9, 13, 6, 4, "f"); rect(g, 10, 14, 4, 2, "F");
  rect(g, 0, 15, 6, 3, "a"); rect(g, 1, 13, 4, 2, "a"); rect(g, 2, 18, 2, 2, "A");
  rect(g, 3, 19, 18, 2, "d");
  return { rows: rowsOf(g), legend: { s: "#7d786e", S: "#9a958a", k: "#2a2020", f: "#ff8a2a", F: "#ffd34d", a: "#4a4a50", A: "#2e2e34", d: "#3a3630" } };
}
function towerSprite(): PixelSprite {
  const g = grid(16, 36);
  rect(g, 3, 8, 2, 26, "w"); rect(g, 11, 8, 2, 26, "w");
  for (let k = 0; k < 5; k++) rect(g, 3, 12 + k * 5, 10, 1, "W");
  rect(g, 1, 6, 14, 2, "w"); rect(g, 1, 3, 1, 3, "w"); rect(g, 14, 3, 1, 3, "w"); rect(g, 1, 3, 14, 1, "W");
  rect(g, 6, 0, 4, 4, "y"); rect(g, 7, 1, 2, 2, "Y");
  rect(g, 2, 33, 12, 2, "k");
  return { rows: rowsOf(g), legend: { w: "#a8783f", W: "#7a532a", y: "#ffd34d", Y: "#fff4c0", k: "#3a2612" } };
}
function raftSprite(): PixelSprite {
  const g = grid(32, 26);
  rect(g, 1, 16, 30, 8, "w");
  for (let k = 0; k < 7; k++) rect(g, 1 + k * 4 + 3, 16, 1, 8, "W");
  rect(g, 1, 20, 30, 1, "W");
  rect(g, 15, 2, 2, 16, "m");
  for (let r = 0; r < 10; r++) rect(g, 17, 3 + r, 2 + r, 1, "s");
  rect(g, 17, 13, 11, 1, "S");
  rect(g, 0, 24, 32, 2, "k");
  return { rows: rowsOf(g), legend: { w: "#a8783f", W: "#7a532a", m: "#5e3a1c", s: "#f2ead0", S: "#c9bea0", k: "#3a2612" } };
}
function workbenchSprite(): PixelSprite {
  const g = grid(20, 14);
  rect(g, 1, 5, 18, 3, "w"); rect(g, 1, 7, 18, 1, "W");
  rect(g, 2, 8, 2, 5, "W"); rect(g, 16, 8, 2, 5, "W");
  rect(g, 4, 2, 2, 3, "m"); rect(g, 4, 4, 1, 1, "h");
  rect(g, 9, 3, 6, 1, "h"); rect(g, 13, 2, 2, 2, "m");
  rect(g, 1, 13, 18, 1, "k");
  return { rows: rowsOf(g), legend: { w: "#b4885a", W: "#8a6440", m: "#c8ccd4", h: "#6e4a26", k: "#3a2612" } };
}
S.house = houseSprite();
S.farm = farmSprite();
S.sawmill = sawmillSprite();
S.quarry = quarrySprite();
S.forge = forgeSprite();
S.tower = towerSprite();
S.raft = raftSprite();
S.workbench = workbenchSprite();

/* hut (village) */
function hutSprite(): PixelSprite {
  const g = grid(30, 28);
  for (let r = 0; r < 11; r++) rect(g, 14 - r, 2 + r, 2 + r * 2, 1, r % 2 ? "r" : "R");
  rect(g, 1, 13, 28, 2, "R");
  rect(g, 3, 15, 24, 11, "w"); for (let k = 0; k < 5; k++) rect(g, 3, 16 + k * 2, 24, 1, "W");
  rect(g, 12, 18, 6, 8, "d"); rect(g, 21, 17, 4, 4, "y"); rect(g, 5, 17, 4, 4, "y");
  rect(g, 2, 26, 26, 2, "k");
  return { rows: rowsOf(g), legend: { r: "#c9a26a", R: "#9a7a48", w: "#a8835c", W: "#7e6040", d: "#5c4328", y: "#ffe9a0", k: "#3a2612" } };
}
S.hut = hutSprite();

Object.assign(S, EXPANSION_SPRITES);
export const SPRITES = S;
const METRICS = new Map<string, { width: number; height: number; ax: number; ay: number; pad: number }>();
function metrics(name: string) {
  let m = METRICS.get(name);
  if (m) return m;
  const sp = S[name];
  const width = Math.max(...sp.rows.map((r) => r.length)), height = sp.rows.length;
  m = { width, height, ax: sp.ax ?? width/2, ay: sp.ay ?? height, pad: (sp.outline === undefined ? OUTLINE : sp.outline) ? 1 : 0 };
  METRICS.set(name,m); return m;
}

/* =========================================================
   BAKING / CACHE
   ========================================================= */
const cache = new Map<string, HTMLCanvasElement>();

function rasterize(sp: PixelSprite, flip: boolean, scale: number, tint: string | null): HTMLCanvasElement {
  const h = sp.rows.length;
  const w = Math.max(...sp.rows.map((r) => r.length));
  const outlineCol = sp.outline === undefined ? OUTLINE : sp.outline;
  const pad = outlineCol ? 1 : 0;
  const cv = document.createElement("canvas");
  cv.width = (w + pad * 2) * scale;
  cv.height = (h + pad * 2) * scale;
  const c = cv.getContext("2d");
  if (!c) return cv;
  const get = (x: number, y: number): string | null => {
    if (y < 0 || y >= h || x < 0 || x >= w) return null;
    const ch = sp.rows[y][x];
    if (!ch || ch === "." || ch === " ") return null;
    return sp.legend[ch] ?? null;
  };
  for (let y = -pad; y < h + pad; y++) {
    for (let x = -pad; x < w + pad; x++) {
      let col = get(x, y);
      if (!col && outlineCol && (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1))) col = outlineCol;
      if (!col) continue;
      const dx = flip ? w - 1 - x : x;
      c.fillStyle = tint ?? col;
      c.fillRect((dx + pad) * scale, (y + pad) * scale, scale, scale);
    }
  }
  return cv;
}

export function getBaked(key: string, sp: PixelSprite, flip = false, scale = SCALE, tint: string | null = null): HTMLCanvasElement {
  const k = `${key}|${flip ? 1 : 0}|${scale}|${tint ?? ""}`;
  let cv = cache.get(k);
  if (!cv) { cv = rasterize(sp, flip, scale, tint); cache.set(k, cv); }
  return cv;
}

export interface DrawOpts {
  flip?: boolean; alpha?: number; tint?: string | null; scale?: number; dy?: number; dx?: number;
  action?: "walk" | "run" | "attack"; carryTool?: "axe" | "pick" | "sword" | "bow"; toolLevel?: number;
  craftPix?: boolean; heroLevel?: number; attackProgress?: number;
}

/** Draw a named world sprite anchored (default bottom-center) at world-screen x,y. */
export function drawSprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, o: DrawOpts = {}) {
  const sp = S[name];
  if (!sp) return;
  const scale = o.scale ?? SCALE;
  const cv = getBaked(name, sp, !!o.flip, scale, o.tint ?? null);
  const { pad, ax, ay } = metrics(name);
  const px = Math.round(x - (ax + pad) * scale + (o.dx ?? 0));
  const py = Math.round(y - (ay + pad) * scale + (o.dy ?? 0));
  if (o.alpha !== undefined && o.alpha < 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * o.alpha;
    ctx.drawImage(cv, px, py);
    ctx.globalAlpha = prev;
  } else ctx.drawImage(cv, px, py);
}

// Tree movement is quantized and baked once per sprite/side/frame. Rendering a
// forest then uses one untransformed drawImage per tree instead of shearing
// hundreds of sprites on every frame.
const swayCache = new Map<string, { canvas: HTMLCanvasElement; padding: number }>();
export function drawSwaySprite(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, bend: number, o: Pick<DrawOpts, "flip" | "alpha"> = {}) {
  const frame = Math.max(-6, Math.min(6, Math.round(bend / 0.012)));
  if (frame === 0) { drawSprite(ctx, name, x, y, o); return; }
  const sp = S[name];
  if (!sp) return;
  const flip = !!o.flip;
  const key = `${name}|${flip ? 1 : 0}|${frame}`;
  let variant = swayCache.get(key);
  const m = metrics(name);
  if (!variant) {
    const base = getBaked(name, sp, flip);
    const shear = frame * 0.012;
    const pivotY = (m.ay + m.pad) * SCALE;
    const padding = Math.ceil(Math.abs(shear) * Math.max(pivotY, base.height - pivotY)) + 1;
    const canvas = document.createElement("canvas");
    canvas.width = base.width + padding * 2;
    canvas.height = base.height;
    const painter = canvas.getContext("2d");
    if (!painter) { drawSprite(ctx, name, x, y, o); return; }
    painter.imageSmoothingEnabled = false;
    painter.setTransform(1, 0, shear, 1, padding - shear * pivotY, 0);
    painter.drawImage(base, 0, 0);
    variant = { canvas, padding };
    swayCache.set(key, variant);
  }
  const px = Math.round(x - (m.ax + m.pad) * SCALE) - variant.padding;
  const py = Math.round(y - (m.ay + m.pad) * SCALE);
  if (o.alpha !== undefined && o.alpha < 1) {
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * o.alpha;
    ctx.drawImage(variant.canvas, px, py);
    ctx.globalAlpha = prev;
  } else ctx.drawImage(variant.canvas, px, py);
}

export function spriteSize(name: string, scale = SCALE) {
  const sp = S[name];
  if (!sp) return { w: 0, h: 0 };
  const m = metrics(name);
  return { w: m.width * scale, h: m.height * scale };
}

/* ---------------- characters ---------------- */
const charCache = new Map<string, PixelSprite>();

function charSprite(lookId: string, view: View, frame: number): PixelSprite {
  const key = `${lookId}:${view}:${frame}`;
  let sp = charCache.get(key);
  if (sp) return sp;
  const look = CHAR_LOOKS[lookId] ?? CHAR_LOOKS.player;
  sp = makeCharacterSprite(look, lookId, view, frame);
  charCache.set(key, sp);
  return sp;
}

export function viewFromAngle(dir: number): { view: View; flip: boolean } {
  const dx = Math.cos(dir);
  const dy = Math.sin(dir);
  // Treat equal-axis diagonals as sideways, including tiny rounding errors.
  if (Math.abs(dy) > Math.abs(dx) + 1e-12) {
    return { view: dy > 0 ? "down" : "up", flip: false };
  }
  return { view: "side", flip: dx < 0 };
}

/** Draw a character (feet at x,y). */
export function drawCharacter(ctx: CanvasRenderingContext2D, lookId: string, x: number, y: number, dir: number, walking: boolean, cycle: number, o: DrawOpts = {}) {
  const { view, flip } = viewFromAngle(dir);
  const action = o.action ?? (walking ? "walk" : "idle");
  const scale = o.scale ?? SCALE;
  const imported = (lookId === "player" || lookId === "rian") && o.craftPix === true && hasCraftHero();
  const originalSword = imported && o.carryTool === "sword" && (o.toolLevel ?? 1) <= 3;
  const phase = Math.floor(cycle * 1.3) & 3;
  const step = action === "attack" ? 5 : action === "run" ? (phase < 2 ? 3 : 4) : walking ? [1, 0, 2, 0][phase] : 0;
  const bob = imported ? 0 : action === "run" ? -Math.abs(Math.sin(cycle * 2.6)) * scale * 1.5 : walking ? -Math.abs(Math.sin(cycle * 1.3)) * scale * 0.65 : action === "attack" ? -scale * 0.35 : 0;
  // Imported art already contains motion; the procedural sprite uses a subtle tilt.
  const tilt = imported ? 0 : action === "run" ? Math.sin(cycle * 1.3) * 0.065 : walking ? Math.sin(cycle * 1.3) * 0.028 : action === "attack" ? -0.045 : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (tilt) ctx.rotate(tilt);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  const drawCarry = () => {
    if (!o.carryTool || action === "attack") return;
    const facing = flip ? -1 : 1;
    ctx.save();
    ctx.translate(view === "side" ? -facing * 11 : 0, bob);
    if (view !== "up") ctx.globalAlpha *= 0.9;
    // The grip stays on the torso rather than sticking through the hair.
    // Prefer the matching supplied tool icon; preserve the tiered fallback.
    const detailed = o.craftPix === true && drawReferenceIcon(ctx, o.carryTool, -18, -39, 38);
    if (detailed) {
      ctx.fillStyle = "#4a3023"; ctx.fillRect(-1, -19, 8, 4);
      ctx.fillStyle = "#c69658"; ctx.fillRect(0, -18, 6, 2);
    } else if (o.carryTool === "bow") {
      drawSprite(ctx, "tool_bow", 0, -4, { scale: 2 });
      ctx.fillStyle = "#4a3023"; ctx.fillRect(-1, -19, 8, 4);
      ctx.fillStyle = "#c69658"; ctx.fillRect(0, -18, 6, 2);
    } else {
      const hx = view === "side" ? -facing * 2 : -7;
      const hy = -18;
      const angle = view === "side" && flip ? -2.1 : -1.04;
      drawToolSprite(ctx, o.carryTool, hx, hy, angle, 1.3, 1, o.toolLevel ?? 1);
      const lx = hx + Math.cos(angle) * 11, ly = hy + Math.sin(angle) * 11;
      ctx.fillStyle = "#4a3023"; ctx.fillRect(Math.round(lx - 4), Math.round(ly - 2), 8, 4);
      ctx.fillStyle = "#c69658"; ctx.fillRect(Math.round(lx - 3), Math.round(ly - 1), 6, 2);
    }
    ctx.restore();
  };
  if (view !== "up" && !originalSword) drawCarry();
  if (imported) {
    drawCraftHero(ctx, view, flip, o.heroLevel ?? 1, action, cycle, o.attackProgress ?? 0, scale, originalSword, lookId === "rian" ? "rian" : "player");
  } else {
    const sp = charSprite(lookId, view, step);
    const cv = getBaked(`char:${lookId}:${view}:${step}`, sp, flip, scale, o.tint ?? null);
    ctx.drawImage(cv, Math.round(-(CHARACTER_WIDTH / 2 + 1) * scale), Math.round(-(CHARACTER_HEIGHT + 1) * scale + bob));
  }
  if (view === "up" && !originalSword) drawCarry();
  ctx.restore();
}

/** Portrait (head only) as a data URL — for React speech bubbles. */
const portraitCache = new Map<string, string>();
export function getPortraitUrl(lookId: string, useCraftPix = true): string {
  const imported = (lookId === "player" || lookId === "rian") && useCraftPix && hasCraftHero();
  const key = `${lookId}:${imported ? "craft" : "fallback"}`;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  let cv: HTMLCanvasElement;
  if (imported) {
    cv = document.createElement("canvas"); cv.width = 48; cv.height = 40;
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false; ctx.translate(24, 72);
      drawCraftHero(ctx, "down", false, 1, "idle", 0, 0, 3, false, lookId === "rian" ? "rian" : "player");
    }
  } else {
    const sp = charSprite(lookId, "down", 0);
    const headSp: PixelSprite = { rows: sp.rows.slice(0, CHARACTER_HEAD_HEIGHT), legend: sp.legend };
    cv = rasterize(headSp, false, 4, null);
  }
  const url = cv.toDataURL();
  portraitCache.set(key, url);
  return url;
}

/** Draw a tool sprite rotated around its grip. */
const toolTiers = new Map<string, PixelSprite>();
export function drawToolSprite(ctx: CanvasRenderingContext2D, tool: "axe" | "pick" | "sword", x: number, y: number, angle: number, scale = 2.2, alpha = 1, level = 1) {
  const name = `tool_${tool}`;
  const base = S[name];
  const tier = Math.min(5, Math.max(1, Math.floor(level)));
  const tierKey = `${name}:tier${tier}`;
  let sp = toolTiers.get(tierKey);
  if (!sp) {
  const metal: Record<string, string> = tier >= 5 ? { m: "#87e4ed", M: "#317f9e", e: "#e0ffff", g: "#52c1c8", G: "#c8ffff" }
    : tier >= 4 ? { m: "#d9c77e", M: "#85652f", e: "#fff5bf", g: "#b99643", G: "#fff1a8" }
    : tier >= 3 ? { m: "#b9d6eb", M: "#557f9f", e: "#f3fbff", g: "#d4af6a", G: "#fff2b7" }
    : tier >= 2 ? { m: "#c7c4b7", M: "#6b7377", e: "#fff7df", g: "#c6a16c", G: "#fce9b1" } : {};
    sp = tier === 1 ? base : { ...base, legend: { ...base.legend, ...metal } };
    toolTiers.set(tierKey, sp);
  }
  const cv = getBaked(tierKey, sp, false, 2, null);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale / 2, scale / 2);
  ctx.globalAlpha *= alpha;
  // Pivot at the wrapped portion of the wooden handle, not at sprite centre.
  ctx.drawImage(cv, -7, -(base.ay ?? 6) * 2 - 2);
  ctx.restore();
}

/** Cached thumbnails shared by inventory, workshop and bestiary panels. */
const thumbnailCache = new Map<string, string>();
export function getSpriteUrl(name: string, useCraftPix = true): string {
  const imported = name === "orc" && useCraftPix && hasCraftOrcs();
  const key = imported ? "craftpix:orc" : name;
  const hit = thumbnailCache.get(key);
  if (hit) return hit;
  if (imported) {
    const url = craftOrcThumbnail();
    if (url) thumbnailCache.set(key, url);
    return url;
  }
  const fallback = name === "orc" ? "treant" : name;
  const sprite = S[fallback];
  if (!sprite) return "";
  const url = getBaked(fallback, sprite, false, 3).toDataURL();
  thumbnailCache.set(key, url);
  return url;
}
export function getCharacterUrl(id = "player", view: View = "down", tool: "axe" | "pick" | "sword" | "bow" = "axe", useCraftPix = true, level = 1): string {
  const imported = id === "player" && useCraftPix && hasCraftHero();
  const referenceTool = useCraftPix && !!referenceIconUrl(tool);
  const key = `portrait-body:${id}:${view}:${tool}:${imported ? `craft:${level}` : "original"}:${referenceTool ? "reference" : "fallback"}`;
  const hit = thumbnailCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = 96; cv.height = 104;
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    drawCharacter(ctx, id, 48, 98, view === "up" ? -Math.PI / 2 : view === "down" ? Math.PI / 2 : 0, false, 0, { carryTool: tool, toolLevel: tool === "sword" || tool === "bow" ? level : 1, craftPix: useCraftPix, heroLevel: level });
  }
  const url = cv.toDataURL();
  thumbnailCache.set(key, url);
  return url;
}
