import type { PixelSprite } from "./sprites";

/** Compact, licence-independent fallbacks for the families in the supplied
 * previews. They remain usable when the locally prepared artwork is absent. */
export const MONSTER_FALLBACKS: Record<string, PixelSprite> = {
  orc: {
    legend: { g: "#538d3d", G: "#2d552d", e: "#ef5a3b", w: "#e5dfbc", b: "#51382c", B: "#32261d", m: "#aeb7bb", M: "#66757a", r: "#8a332b" },
    rows: [
      "......GGGG......", "....GGggggGG....", "..GGggggggggGG..", "GGggggggggggggGG",
      ".GggeggggegGggG.", "..GggggggggggG..", "...GgwwggwwgG...", "....GggggggG....",
      "...BBGGGGGGBB...", "..BbggbbbbggbB..", ".MBbgbbrrbbgbB..", "MM.BbbrbbbrbB...",
      ".M..BbbrrbbB....", ".M..BbbbbbbB....", ".M...GG..GG.....", ".M..Ggg..ggG....",
      ".M..BB....BB....", "....BB....BB....",
    ],
  },
  zombie: {
    legend: { z: "#aab3a0", Z: "#738577", k: "#34333a", e: "#f2e7ca", r: "#8b4546", b: "#65564d", B: "#3c3634", c: "#887c6d" },
    rows: [
      ".....BBBBBB.....", "...BBbbbbbbBB...", "..BZzzzzzzzzZB..", "..ZzzzzzzzzzZ...",
      "..ZzeezkkeezZ...", "..ZzeekZkeeZZ...", "..ZzzzzzzzzzZ...", "...ZzzrrrrzZ....",
      "....ZZZrrZZ.....", "...BBbcccBB.....", "..ZBbbccccbBZ...", ".ZZBbbccccbBZZ..",
      ".Z..BbBccBb..Z..", "....BbBccBb.....", "....BBbBBbB.....", "....BB....BB....",
      "....BB....BB....", "...BBB....BBB...",
    ],
  },
  skeleton: {
    legend: { w: "#e5debf", W: "#b0a997", k: "#36323b", b: "#425b72", B: "#293949", m: "#8fb5d1", M: "#4b728f", h: "#7a5639" },
    rows: [
      "......wwww......", "....wwWWwwww....", "...wWWwwwwwwW...", "...wwkkwwkkww...", "...wwkkwwkkww...",
      "...wwwwwwwwwW...", "....wWkwkwWw....", ".....WWWWWW.....", "..BBwwwwwwBB....", "..BbWwWWwWBb..M.",
      ".w.bWWwwWWb.wMM.", ".w..bWwwWb..wMm.", "....bbWWbb...Mh.", "....WWWWWW..h...", "....WW..WW......",
      "....ww..ww......", "...WWW..WWW.....", "..wwW....Www....",
    ],
  },
  vampire: {
    legend: { p: "#d5e1dd", P: "#a0b4af", k: "#27302e", e: "#e0464a", b: "#283b52", B: "#172332", r: "#a73138", R: "#651d2b", w: "#f4f2df" },
    rows: [
      "...R.......R....", "..RrR.kkkk.RrR..", ".RrrRkppppkRrrR.", "RrrrkpPPpppkrrrR", "RrrRkpeepeepkRrR",
      "RrR.kppppppk.RrR", ".R...kpwwpk...R.", ".R..BBkkkkBB..R.", "..RrBbbbbbbBrR..", "..RrBbbPPbbBrR..",
      "...RBbbPPbbBR...", "...RBBbbbbBBR...", "....RBbbbbBR....", ".....BB..BB.....", "....BBB..BBB....", "...BBBB..BBBB...",
    ],
  },
  lich: {
    legend: { w: "#dfd8bd", W: "#aaa08b", k: "#2a2732", b: "#435670", B: "#283344", g: "#e9b657", G: "#8e612f", h: "#79543c", c: "#64d9c5" },
    rows: [
      ".....g.g.g....c.", ".....ggggg...ccc", "....GgGGGgG...c.", "....wwwwwww...h.", "...wWwwwwwwW..h.",
      "...wwkkwwkkw..h.", "...wwwwwwwww..h.", "....wwkwkww...h.", ".....WWWWW....h.", "..BBGwwwwwGB..h.",
      ".BBbGbbbbGbBB.h.", ".W.bbGbbGbb.W.h.", "....bGGGGGb...h.", "...BBbbbbBBB..h.", "...BbbbbbbbB..h.",
      "..BBbbbbbbbBB.h.", "..BBBGGGGGBBB.h.", "..WWW.....WWW...",
    ],
  },
};
