import type { CharLook, PixelSprite, View } from "./sprites";

/** A compact, layered pixel character. Coordinates are kept in sprite pixels;
 * the canvas renderer scales them with nearest-neighbour interpolation. */
export const CHARACTER_WIDTH = 20;
export const CHARACTER_HEIGHT = 29;
export const CHARACTER_HEAD_HEIGHT = 17;

type Grid = string[][];

function block(grid: Grid, x: number, y: number, w: number, h: number, color: string) {
  for (let row = Math.max(0, y); row < Math.min(CHARACTER_HEIGHT, y + h); row++) {
    for (let col = Math.max(0, x); col < Math.min(CHARACTER_WIDTH, x + w); col++) {
      grid[row][col] = color;
    }
  }
}

function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (component: number) => Math.round(component + (255 - component) * amount);
  return `rgb(${mix((value >> 16) & 255)},${mix((value >> 8) & 255)},${mix(value & 255)})`;
}

function palette(look: CharLook, id: string): Record<string, string> {
  const scarf: Record<string, string> = {
    player: "#b34d43", rian: "#d9b96a", maya: "#d1b968", tito: "#8e5733", bren: "#cf9854",
  };
  return {
    H: look.hairD, h: look.hair, j: lighten(look.hair, 0.2),
    s: look.skin, S: look.skinD, u: lighten(look.skin, 0.22),
    e: "#18202c", i: look.eye, w: "#f3f5ef", m: "#8e5140",
    t: look.shirt, T: look.shirtD, v: lighten(look.shirt, 0.24),
    p: look.pants, P: look.pantsD, q: lighten(look.pants, 0.16),
    b: look.boots, B: "#261e1b", a: look.belt, A: "#e0bd72",
    x: look.hat, X: look.hatD, z: lighten(look.hat, 0.2),
    r: scarf[id] ?? "#c39b72", c: "#e9d8b4", d: "#53372a",
  };
}

function body(g: Grid, view: View, frame: number, id: string) {
  // Neck, shoulders, sleeves and hands. Every view shares the same silhouette.
  block(g, 8, 15, 4, 3, "S");
  block(g, 9, 15, 2, 3, "s");
  const shift = frame === 1 ? 1 : frame === 2 ? -1 : 0;

  if (view === "side") {
    block(g, 6, 17, 8, 6, "T");
    block(g, 7, 17, 6, 5, "t");
    block(g, 8, 17, 3, 1, "v");
    // Side arm and cuff; alternating steps move it slightly.
    block(g, 11, 18 + shift, 3, 4, "T");
    block(g, 11, 18 + shift, 2, 3, "t");
    block(g, 11, 21 + shift, 3, 1, "a");
    block(g, 11, 22 + shift, 3, 1, "s");
    block(g, 7, 22, 7, 1, "a");
    block(g, 11, 22, 1, 1, "A");
  } else {
    block(g, 5, 17, 10, 6, "T");
    block(g, 6, 17, 8, 5, "t");
    block(g, 6, 17, 2, 1, "v");
    block(g, 12, 17, 2, 1, "v");
    block(g, 4, 18 + shift, 2, 4, "T");
    block(g, 14, 18 - shift, 2, 4, "T");
    block(g, 4, 18 + shift, 1, 3, "t");
    block(g, 15, 18 - shift, 1, 3, "t");
    block(g, 4, 21 + shift, 2, 1, "a");
    block(g, 14, 21 - shift, 2, 1, "a");
    block(g, 4, 22 + shift, 2, 1, "s");
    block(g, 14, 22 - shift, 2, 1, "s");
    block(g, 6, 22, 8, 1, "a");
    block(g, 9, 22, 2, 1, "A");
  }

  // Individual clothes remain recognisable from the back and the sides.
  if (view === "down") {
    block(g, 8, 17, 4, 1, "c");
    block(g, 9, 18, 2, 1, "r");
    block(g, 7, 19, 1, 3, "a");
    block(g, 8, 20, 1, 1, "a");
    block(g, 12, 20, 1, 1, "v");
    if (id === "bren") { // leather blacksmith apron
      block(g, 7, 19, 6, 3, "a");
      block(g, 8, 20, 4, 1, "d");
    }
    if (id === "rian" || id === "maya") {
      block(g, 6, 18, 2, 2, "T");
      block(g, 12, 18, 2, 2, "T");
      block(g, 9, 19, 2, 1, "A");
    }
  } else if (view === "up") {
    // Strap and small explorer's pack make the rear view distinct.
    block(g, 7, 18, 6, 4, "a");
    block(g, 8, 18, 4, 3, "d");
    block(g, 8, 18, 4, 1, "A");
    block(g, 9, 20, 2, 1, "A");
    if (id === "maya") {
      block(g, 5, 18, 2, 4, "T");
      block(g, 13, 18, 2, 4, "T");
    }
  } else {
    block(g, 7, 18, 2, 3, "a");
    block(g, 7, 17, 3, 1, "r");
  }

  // Trousers and boots, with two separate walking frames.
  block(g, 6, 23, 8, 2, "P");
  block(g, 7, 23, 6, 2, "p");
  if (view === "side") {
    const left = frame === 1 ? 5 : 6;
    const right = frame === 1 ? 11 : frame === 2 ? 12 : 10;
    block(g, left, 25, 3, frame === 2 ? 2 : 3, "p");
    block(g, right, 25, 3, frame === 1 ? 2 : 3, "P");
    block(g, left - 1, frame === 2 ? 27 : 28, 4, 1, "B");
    block(g, right, frame === 1 ? 27 : 28, 4, 1, "B");
    block(g, left - 1, frame === 2 ? 26 : 27, 4, 1, "b");
    block(g, right, frame === 1 ? 26 : 27, 4, 1, "b");
  } else {
    block(g, 6, 25, 3, frame === 2 ? 2 : 3, "p");
    block(g, 11, 25, 3, frame === 1 ? 2 : 3, "p");
    block(g, 7, 25, 1, 1, "q");
    block(g, 12, 25, 1, 1, "q");
    const leftFoot = frame === 2 ? 27 : 28;
    const rightFoot = frame === 1 ? 27 : 28;
    block(g, 5, leftFoot - 1, 4, 1, "b");
    block(g, 5, leftFoot, 4, 1, "B");
    block(g, 11, rightFoot - 1, 4, 1, "b");
    block(g, 11, rightFoot, 4, 1, "B");
  }
}

function animateBody(g: Grid, view: View, frame: number, id: string) {
  if (frame === 0) return;
  const run = frame === 3 || frame === 4;
  const attacking = frame === 5;
  // Shift the whole upper body and shoulders with the stride, not just the feet.
  if (!attacking) {
    const offset = frame === 1 || frame === 3 ? 1 : -1;
    for (let y = 17; y <= 21; y++) {
      const row = [...g[y]];
      for (let x = 2; x < CHARACTER_WIDTH - 2; x++) g[y][x] = ".";
      for (let x = 2; x < CHARACTER_WIDTH - 2; x++) {
        if (row[x] !== "." && x + offset >= 1 && x + offset < CHARACTER_WIDTH - 1) g[y][x + offset] = row[x];
      }
    }
    if (run) {
      // Faster, wider alternating stride; the other boot kicks off the ground.
      block(g, 4, 25, 12, 4, ".");
      if (view === "side") {
        const leading = frame === 3;
        block(g, leading ? 11 : 5, 25, 3, 3, "p");
        block(g, leading ? 13 : 4, 27, 5, 1, "b");
        block(g, leading ? 13 : 4, 28, 5, 1, "B");
        block(g, leading ? 5 : 11, 25, 3, 2, "P");
        block(g, leading ? 3 : 10, 26, 5, 1, "b");
      } else {
        const leading = frame === 3;
        block(g, leading ? 5 : 11, 25, 3, 3, "p");
        block(g, leading ? 4 : 11, 27, 5, 1, "b");
        block(g, leading ? 4 : 11, 28, 5, 1, "B");
        block(g, leading ? 11 : 6, 25, 3, 2, "P");
        block(g, leading ? 12 : 5, 26, 5, 1, "b");
      }
      // Trailing scarf/coat flicks up while running.
      block(g, view === "side" ? 4 : 6, 17, 2, 1, "r");
      block(g, view === "side" ? 3 : 5, frame === 3 ? 18 : 20, 2, 1, "r");
      if (id === "rian" || id === "maya") block(g, 6, 23, 3, 1, "T");
    }
    return;
  }
  // The forward arm reaches for the grip when swinging; the other braces the
  // torso. Attack is baked once for each direction instead of per-frame paths.
  if (view === "side") {
    block(g, 11, 18, 3, 5, ".");
    block(g, 12, 17, 3, 2, "T");
    block(g, 14, 18, 3, 2, "t");
    block(g, 16, 18, 2, 1, "a");
    block(g, 17, 18, 2, 2, "s");
    block(g, 6, 19, 2, 4, "T");
  } else {
    block(g, 14, 18, 2, 5, ".");
    block(g, 14, 17, 2, 2, "T");
    block(g, 15, 18, 2, 2, "t");
    block(g, 16, 19, 2, 1, "a");
    block(g, 17, 19, 2, 2, "s");
    block(g, 4, 19, 2, 4, "T");
  }
}

function hairShape(g: Grid, view: View, look: CharLook) {
  // Rounded silhouette and small clusters of highlights give the hair volume.
  if (view === "side") {
    block(g, 6, 4, 8, 1, "H");
    block(g, 5, 5, 10, 1, "H");
    block(g, 4, 6, 12, 7, "H");
    block(g, 5, 6, 10, 5, "h");
    block(g, 6, 5, 7, 2, "h");
    block(g, 6, 6, 3, 1, "j");
    block(g, 5, 8, 2, 2, "j");
    block(g, 5, 11, 4, 3, "H");
    block(g, 6, 11, 2, 2, "h");
  } else {
    block(g, 7, 4, 6, 1, "H");
    block(g, 5, 5, 10, 1, "H");
    block(g, 4, 6, 12, 7, "H");
    block(g, 5, 6, 10, 6, "h");
    block(g, 6, 5, 8, 1, "h");
    block(g, 6, 6, 3, 1, "j");
    block(g, 5, 8, 2, 2, "j");
    block(g, 12, 7, 2, 2, "j");
    if (view === "up") {
      block(g, 5, 11, 10, 3, "h");
      block(g, 6, 14, 8, 1, "H");
      block(g, 7, 9, 2, 3, "j");
      block(g, 11, 10, 2, 3, "H");
      block(g, 13, 8, 1, 3, "j");
    }
  }

  if (look.style === "topknot") {
    // High tied bun and the sideways trailing lock of the reference.
    block(g, 8, 1, 4, 4, "H");
    block(g, 9, 0, 2, 1, "H");
    block(g, 9, 1, 2, 3, "h");
    block(g, 9, 1, 1, 2, "j");
    block(g, 12, 2, 4, 2, "H");
    block(g, 13, 2, 3, 1, "j");
    block(g, 16, 3, 2, 2, "H");
    block(g, 16, 3, 1, 1, "h");
    if (view === "up") {
      block(g, 12, 12, 3, 3, "H");
      block(g, 13, 13, 1, 2, "h");
    }
  }
}

function face(g: Grid, view: View, hood: boolean) {
  if (view === "up") return;
  if (view === "side") {
    block(g, 10, 9, 5, 6, "S");
    block(g, 10, 9, 5, 5, "s");
    block(g, 15, 10, 1, 4, "s");
    block(g, 16, 12, 1, 2, "S"); // nose, points to the right
    block(g, 11, 9, 3, 1, "u");
    block(g, 12, 10, 3, 1, "H"); // eyebrow
    block(g, 12, 11, 3, 2, "e");
    block(g, 13, 11, 1, 1, "w");
    block(g, 14, 12, 1, 1, "i");
    block(g, 13, 14, 2, 1, "m");
    block(g, 9, 11, 1, 2, "S"); // ear
  } else {
    block(g, 6, 9, 8, 7, "S");
    block(g, 5, 10, 10, 4, "S");
    block(g, 6, 9, 8, 6, "s");
    block(g, 7, 9, 6, 1, "u");
    block(g, 5, 11, 1, 2, "s");
    block(g, 14, 11, 1, 2, "s");
    block(g, 6, 10, 3, 1, "H");
    block(g, 11, 10, 3, 1, "H");
    block(g, 6, 11, 3, 2, "e");
    block(g, 11, 11, 3, 2, "e");
    block(g, 7, 11, 1, 1, "w");
    block(g, 12, 11, 1, 1, "w");
    block(g, 8, 12, 1, 1, "i");
    block(g, 13, 12, 1, 1, "i");
    block(g, 9, 13, 2, 1, "u");
    block(g, 9, 14, 2, 1, "m");
    block(g, 8, 15, 4, 1, "s");
  }
  if (hood) {
    block(g, view === "side" ? 4 : 4, 10, 1, 4, "X");
    if (view === "down") block(g, 15, 10, 1, 4, "X");
  }
}

function headwear(g: Grid, view: View, look: CharLook) {
  if (look.style === "hat") {
    // A broad, banded ranger hat, including the back and side silhouettes.
    block(g, 7, 1, 6, 1, "X");
    block(g, 6, 2, 8, 1, "X");
    block(g, 5, 3, 10, 3, "X");
    block(g, 6, 3, 8, 2, "x");
    block(g, 7, 2, 5, 1, "z");
    block(g, 6, 5, 8, 1, "d");
    block(g, 7, 5, 6, 1, "A");
    block(g, 3, 6, 14, 2, "X");
    block(g, 4, 6, 12, 1, "x");
    if (view === "side") {
      block(g, 15, 6, 3, 2, "X");
      block(g, 15, 6, 2, 1, "x");
    }
  } else if (look.style === "hood") {
    block(g, 7, 2, 6, 2, "X");
    block(g, 5, 4, 10, 2, "X");
    block(g, 6, 4, 8, 2, "x");
    block(g, 4, 6, 2, 7, "X");
    block(g, 5, 7, 1, 4, "x");
    if (view !== "side") {
      block(g, 14, 6, 2, 7, "X");
      block(g, 14, 7, 1, 4, "x");
    }
    if (view === "up") {
      block(g, 6, 6, 8, 7, "x");
      block(g, 8, 7, 2, 4, "z");
      block(g, 6, 13, 8, 2, "X");
    }
  }
}

export function makeCharacterSprite(look: CharLook, id: string, view: View, frame: number): PixelSprite {
  const g: Grid = Array.from({ length: CHARACTER_HEIGHT }, () => Array(CHARACTER_WIDTH).fill("."));
  body(g, view, frame, id);
  animateBody(g, view, frame, id);
  // A continuous leather shoulder harness, visible from every direction.
  if (view === "up") {
    block(g, 6, 17, 2, 5, "d");
    block(g, 12, 17, 2, 5, "d");
    block(g, 7, 18, 6, 4, "a");
    block(g, 8, 18, 1, 3, "A");
    block(g, 11, 19, 2, 2, "d");
  } else if (view === "down") {
    for (let i = 0; i < 5; i++) block(g, 12 - i, 17 + i, 2, 1, "a");
    block(g, 8, 20, 2, 2, "A");
    block(g, 9, 20, 1, 1, "d");
  } else {
    block(g, 7, 17, 2, 5, "d");
    block(g, 8, 18, 1, 3, "A");
  }
  hairShape(g, view, look);
  face(g, view, look.style === "hood");
  headwear(g, view, look);
  return {
    rows: g.map((row) => row.join("")),
    legend: palette(look, id),
    ax: CHARACTER_WIDTH / 2,
    ay: CHARACTER_HEIGHT,
  };
}
